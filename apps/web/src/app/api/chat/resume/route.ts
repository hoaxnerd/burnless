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
import type { ContentBlock, InputFormSpec, FormField, PlanSpec } from "@burnless/ai"; // already exported from the package index
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
    .optional(),
  formData: z.record(z.string(), z.unknown()).optional(),
  /** The user-approved (possibly edited) plan, for a kind:"plan" pause. */
  plan: z
    .object({
      title: z.string().max(200),
      description: z.string().max(500).optional(),
      steps: z.array(z.record(z.string(), z.unknown())).max(50),
    })
    .optional(),
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

  const completedResults = pendingRow.completedResults as ContentBlock[];
  const assistantBlocks = pendingRow.assistantBlocks as ContentBlock[];

  // SCENARIO SAFETY: execute held tools against the scenario the turn was paused in
  // (persisted on the pending row), loaded scoped to the company — NOT getDefaultScenario.
  // A pause inside a non-default scenario must resume into that same overlay (spec §5).
  const [scenario] = await db
    .select()
    .from(scenariosTable)
    .where(and(eq(scenariosTable.id, pendingRow.scenarioId), eq(scenariosTable.companyId, ctx.companyId)));
  if (!scenario) return errorResponse("Scenario for the paused turn not found", 404);

  // INPUT pause (genui plan 1): validate the submitted formData against the stored
  // spec, synthesize a single tool_result for the form's tool_use id, and resume
  // the loop. No permission decisions are involved (spec §7 — input and permission
  // pauses are exclusive).
  if (pendingRow.kind === "input") {
    const inputPending = pendingRow.pending as { inputToolUseId: string; spec: InputFormSpec };
    const spec = inputPending.spec;
    const formData = (body.formData ?? {}) as Record<string, unknown>;

    const missing = (spec.fields as FormField[])
      .filter((f) => f.required)
      .filter(
        (f) => formData[f.name] === undefined || formData[f.name] === null || formData[f.name] === ""
      )
      .map((f) => f.name);
    if (missing.length > 0) {
      return errorResponse(`Missing required field(s): ${missing.join(", ")}`, 400);
    }

    const inputResult: ContentBlock = {
      type: "tool_result",
      toolUseId: inputPending.inputToolUseId,
      content: JSON.stringify(formData),
    };
    await resolvePendingAction(pendingRow.id);

    const inputHistory = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, body.conversationId))
      .orderBy(asc(aiMessages.createdAt));
    const inputMessages: ChatMessage[] = inputHistory
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    inputMessages.push({ role: "assistant", content: assistantBlocks });
    inputMessages.push({ role: "user", content: [...completedResults, inputResult] });

    const { contextText: inputBaseContext } = await buildAiContext(ctx.companyId, {
      id: scenario.id,
      name: scenario.name,
      source: scenario.source ?? "blank",
    });
    const inputOverrideCount = await getOverrideCount(scenario.id);
    const inputContextText =
      (inputOverrideCount > 0
        ? `You are working inside scenario "${scenario.name}". ${inputOverrideCount} changes from base.\nAll changes are overrides — base data will not be modified.\n\n`
        : "") + inputBaseContext;

    const inputProviderConfig = await getCompanyProviderConfig(ctx.companyId);
    const inputAiFlags = await getAiFlags(ctx.companyId);
    const inputSavedDefaults = await getPermissionDefaults(ctx.userId, ctx.companyId);
    const inputDefaults: PermissionDefaults = inputSavedDefaults
      ? {
          read: inputSavedDefaults.readMode,
          write: inputSavedDefaults.writeMode,
          delete: inputSavedDefaults.deleteMode,
          web_search: inputSavedDefaults.webSearchMode,
          browser_use: inputSavedDefaults.browserUseMode,
        }
      : BUILTIN_PERMISSION_DEFAULTS;
    const inputSessionGrants = await getSessionGrants(body.conversationId);

    return buildChatSSEResponse({
      companyId: ctx.companyId,
      userId: ctx.userId,
      scenarioId: scenario.id,
      conversationId: body.conversationId,
      messages: inputMessages,
      financialContext: inputContextText,
      companionName: inputAiFlags.companionName,
      providerConfig: inputProviderConfig,
      defaults: inputDefaults,
      sessionGrants: inputSessionGrants,
    });
  }

  // PLAN pause (worklog plan 1): the user approved/edited the proposed plan.
  // Synthesize a tool_result for the propose_plan tool_use id carrying the
  // approved plan, then resume — the model proceeds to call the real tools
  // (which themselves hit the permission/diff gate). Exclusive with input/permission.
  if (pendingRow.kind === "plan") {
    const planPending = pendingRow.pending as { planToolUseId: string; spec: PlanSpec };
    const approvedPlan = (body.plan as PlanSpec | undefined) ?? planPending.spec;

    const planResult: ContentBlock = {
      type: "tool_result",
      toolUseId: planPending.planToolUseId,
      content: JSON.stringify({ approved: true, plan: approvedPlan }),
    };
    await resolvePendingAction(pendingRow.id);

    const planHistory = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, body.conversationId))
      .orderBy(asc(aiMessages.createdAt));
    const planMessages: ChatMessage[] = planHistory
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    planMessages.push({ role: "assistant", content: assistantBlocks });
    planMessages.push({ role: "user", content: [...completedResults, planResult] });

    const { contextText: planBaseContext } = await buildAiContext(ctx.companyId, {
      id: scenario.id,
      name: scenario.name,
      source: scenario.source ?? "blank",
    });
    const planOverrideCount = await getOverrideCount(scenario.id);
    const planContextText =
      (planOverrideCount > 0
        ? `You are working inside scenario "${scenario.name}". ${planOverrideCount} changes from base.\nAll changes are overrides — base data will not be modified.\n\n`
        : "") + planBaseContext;

    const planProviderConfig = await getCompanyProviderConfig(ctx.companyId);
    const planAiFlags = await getAiFlags(ctx.companyId);
    const planSavedDefaults = await getPermissionDefaults(ctx.userId, ctx.companyId);
    const planDefaults: PermissionDefaults = planSavedDefaults
      ? {
          read: planSavedDefaults.readMode,
          write: planSavedDefaults.writeMode,
          delete: planSavedDefaults.deleteMode,
          web_search: planSavedDefaults.webSearchMode,
          browser_use: planSavedDefaults.browserUseMode,
        }
      : BUILTIN_PERMISSION_DEFAULTS;
    const planSessionGrants = await getSessionGrants(body.conversationId);

    return buildChatSSEResponse({
      companyId: ctx.companyId,
      userId: ctx.userId,
      scenarioId: scenario.id,
      conversationId: body.conversationId,
      messages: planMessages,
      financialContext: planContextText,
      companionName: planAiFlags.companionName,
      providerConfig: planProviderConfig,
      defaults: planDefaults,
      sessionGrants: planSessionGrants,
    });
  }

  // PERMISSION pause (existing path): require decisions.
  if (!body.decisions || body.decisions.length === 0) {
    return errorResponse("decisions required to resume a permission pause", 400);
  }
  const pending = pendingRow.pending as PendingActionRecord[];
  const decisionMap = new Map(body.decisions.map((d) => [d.requestId, d.decision]));

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
