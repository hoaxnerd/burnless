// apps/web/src/app/api/chat/resume/route.ts
/**
 * POST /api/chat/resume — resume a paused assistant turn after the user decides
 * on the pending tool actions. Executes approved tools, synthesizes results for
 * denied ones, reconstructs history, and re-streams via the shared responder.
 */
import { z } from "zod";
import {
  db,
  getActivePendingAction,
  resolvePendingAction,
  grantSessionPermission,
  getSessionGrants,
  getPermissionDefaults,
  getOverrideCount,
} from "@burnless/db";
import { aiConversations, aiMessages, scenarios as scenariosTable } from "@burnless/db";
import { eq, and, asc } from "drizzle-orm";
import {
  categorizeToolName,
  BUILTIN_PERMISSION_DEFAULTS,
  type ChatMessage,
  type PermissionDefaults,
} from "@burnless/ai";
import type { ContentBlock } from "@burnless/ai"; // already exported from the package index
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { checkAiFeatureAllowed, getCompanyProviderConfig, getAiFlags } from "@/lib/ai-feature-flags";
import { executeToolCall, logDeniedToolCall } from "@/lib/ai-tools";
import { buildAiContext } from "@/lib/build-ai-context";
import { setTrackingCompanyId } from "@/lib/ai-usage-tracker";
import { buildChatSSEResponse } from "@/lib/chat-stream";

const resumeSchema = z.object({
  conversationId: z.string().min(1),
  pauseId: z.string().min(1),
  decisions: z
    .array(
      z.object({
        requestId: z.string().min(1),
        decision: z.enum(["once", "session", "deny"]),
      })
    )
    .min(1),
});

interface PendingActionRecord {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

export const POST = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "chat");
  if (blocked) return blocked;

  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  setTrackingCompanyId(ctx.companyId);

  let body: z.infer<typeof resumeSchema>;
  try {
    body = resumeSchema.parse(await request.json());
  } catch {
    return errorResponse("Invalid request body", 400);
  }

  const aiCheck = await checkAiFeatureAllowed(ctx.companyId, "chat");
  if (!aiCheck.allowed) return errorResponse(aiCheck.reason!, 403);

  // Verify conversation ownership.
  const [conv] = await db
    .select({ id: aiConversations.id })
    .from(aiConversations)
    .where(and(eq(aiConversations.id, body.conversationId), eq(aiConversations.companyId, ctx.companyId)));
  if (!conv) return errorResponse("Conversation not found", 404);

  // Load the active pending batch and verify it matches.
  const pendingRow = await getActivePendingAction(body.conversationId);
  if (!pendingRow || pendingRow.pauseId !== body.pauseId) {
    return errorResponse("No matching pending action to resume", 409);
  }

  const pending = pendingRow.pending as PendingActionRecord[];
  const completedResults = pendingRow.completedResults as ContentBlock[];
  const assistantBlocks = pendingRow.assistantBlocks as ContentBlock[];
  const decisionMap = new Map(body.decisions.map((d) => [d.requestId, d.decision]));

  // SCENARIO SAFETY: execute held tools against the scenario the turn was paused in
  // (persisted on the pending row), loaded scoped to the company — NOT getDefaultScenario.
  // A pause inside a non-default scenario must resume into that same overlay (spec §5).
  const [scenario] = await db
    .select()
    .from(scenariosTable)
    .where(and(eq(scenariosTable.id, pendingRow.scenarioId), eq(scenariosTable.companyId, ctx.companyId)));
  if (!scenario) return errorResponse("Scenario for the paused turn not found", 404);

  // Execute / synthesize results for each pending action.
  const pendingResults: ContentBlock[] = [];
  for (const action of pending) {
    const decision = decisionMap.get(action.requestId) ?? "deny";
    const category = categorizeToolName(action.toolName);

    if (decision === "deny") {
      logDeniedToolCall(
        { companyId: ctx.companyId, userId: ctx.userId, conversationId: body.conversationId },
        action.toolName,
        action.toolInput
      );
      pendingResults.push({
        type: "tool_result",
        toolUseId: action.requestId,
        content: JSON.stringify({ declined: true, message: "The user declined this action." }),
      });
      continue;
    }

    if (decision === "session") {
      await grantSessionPermission(body.conversationId, category);
    }

    const result = await executeToolCall(action.toolName, action.toolInput, {
      companyId: ctx.companyId,
      scenarioId: scenario.id,
      userId: ctx.userId,
      conversationId: body.conversationId,
      permissionDecision: decision === "session" ? "granted_session" : "granted_once",
    });
    pendingResults.push({ type: "tool_result", toolUseId: action.requestId, content: result });
  }

  await resolvePendingAction(pendingRow.id);

  // Reconstruct message history: prior text turns + the paused assistant turn +
  // a single user message carrying ALL tool_result blocks.
  const history = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, body.conversationId))
    .orderBy(asc(aiMessages.createdAt));

  const messages: ChatMessage[] = history
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  messages.push({ role: "assistant", content: assistantBlocks });
  messages.push({ role: "user", content: [...completedResults, ...pendingResults] });

  // Rebuild financial context.
  const { contextText: baseContextText } = await buildAiContext(ctx.companyId, {
    id: scenario.id,
    name: scenario.name,
    source: scenario.source ?? "blank",
  });
  const overrideCount = await getOverrideCount(scenario.id);
  const contextText =
    (overrideCount > 0
      ? `You are working inside scenario "${scenario.name}". ${overrideCount} changes from base.\nAll changes are overrides — base data will not be modified.\n\n`
      : "") + baseContextText;

  const providerConfig = await getCompanyProviderConfig(ctx.companyId);
  const aiFlags = await getAiFlags(ctx.companyId);

  // Re-resolve defaults + (now possibly updated) grants for any further tool calls.
  const savedDefaults = await getPermissionDefaults(ctx.userId, ctx.companyId);
  const defaults: PermissionDefaults = savedDefaults
    ? {
        read: savedDefaults.readMode,
        write: savedDefaults.writeMode,
        delete: savedDefaults.deleteMode,
        web_search: savedDefaults.webSearchMode,
        browser_use: savedDefaults.browserUseMode,
      }
    : BUILTIN_PERMISSION_DEFAULTS;
  const sessionGrants = await getSessionGrants(body.conversationId);

  return buildChatSSEResponse({
    companyId: ctx.companyId,
    userId: ctx.userId,
    scenarioId: scenario.id,
    conversationId: body.conversationId,
    messages,
    financialContext: contextText,
    companionName: aiFlags.companionName,
    providerConfig,
    defaults,
    sessionGrants,
  });
});
