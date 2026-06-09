/**
 * POST /api/chat — Main AI chat endpoint with streaming responses.
 *
 * Accepts a user message + optional conversationId, streams Claude's response
 * back as Server-Sent Events. Handles tool calls server-side.
 */

import { z } from "zod";
import { db, getOverrideCount, getPermissionDefaults, getSessionGrants, getActivePendingAction, resolvePendingAction } from "@burnless/db";
import { aiConversations, aiMessages, scenarios as scenariosTable } from "@burnless/db";
import { eq, and, asc } from "drizzle-orm";
import { type ChatMessage, BUILTIN_PERMISSION_DEFAULTS, type PermissionDefaults } from "@burnless/ai";
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { checkAiFeatureAllowed, getCompanyProviderConfig, getAiFlags } from "@/lib/ai-feature-flags";
import { buildAiContext } from "@/lib/build-ai-context";
import { getDefaultScenario } from "@/lib/data";
import { resolveWriteScenarioId } from "@/lib/ai-write-target";
import { setTrackingCompanyId } from "@/lib/ai-usage-tracker";
import { buildChatSSEResponse } from "@/lib/chat-stream";
import { getActiveScenario, ScenarioSafetyError } from "@/lib/scenario-middleware";

const chatSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().nullable().optional(),
  scenarioId: z.string().nullable().optional(),
});

export const POST = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "chat");
  if (blocked) return blocked;

  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  // Set company context for usage tracking
  setTrackingCompanyId(ctx.companyId);

  // Dual-channel scenario safety (spec §6 decision 4): cookie + X-Scenario-Id must
  // agree. apiFetch keeps them in lockstep, so this only fires on a genuine drift.
  try {
    getActiveScenario(request);
  } catch (e) {
    return errorResponse(e instanceof ScenarioSafetyError ? e.message : "Scenario channel mismatch", 409);
  }

  let body: z.infer<typeof chatSchema>;
  try {
    body = chatSchema.parse(await request.json());
  } catch {
    return errorResponse("Invalid request body", 400);
  }

  // Feature gate: check AI feature flags (master switch + chat toggle + data mode + credits)
  const aiCheck = await checkAiFeatureAllowed(ctx.companyId, "chat");
  if (!aiCheck.allowed) {
    return errorResponse(aiCheck.reason!, 403);
  }

  // Get or create conversation
  let conversationId = body.conversationId;
  if (conversationId) {
    // Verify conversation belongs to this company
    const [existing] = await db
      .select({ id: aiConversations.id })
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.id, conversationId),
          eq(aiConversations.companyId, ctx.companyId)
        )
      );
    if (!existing) {
      return errorResponse("Conversation not found", 404);
    }
  } else {
    const [conv] = await db
      .insert(aiConversations)
      .values({
        companyId: ctx.companyId,
        userId: ctx.userId,
        title: body.message.slice(0, 100),
      })
      .returning();
    conversationId = conv!.id;
  }

  // Stale-pause guard (Plan 5): if the user left a plan/diff card unresolved and
  // sends a new message, free the single-active slot first so the new turn's pause
  // doesn't trip the ai_pending_actions_active_idx unique index (duplicate-key).
  // The orphaned card goes inert (its resume 409s — already handled).
  const stalePending = await getActivePendingAction(conversationId);
  if (stalePending) await resolvePendingAction(stalePending.id);

  // Per-user permission defaults (fall back to builtin) + this conversation's grants.
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
  const sessionGrants = await getSessionGrants(conversationId);

  // Save user message
  await db.insert(aiMessages).values({
    conversationId,
    role: "user",
    content: body.message,
  });

  // Load conversation history
  const history = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt));

  const messages: ChatMessage[] = history
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  // Resolve scenario for READ context (financial snapshot). Falls back to the
  // default scenario so the AI always has a base picture.
  let scenario;
  let found: typeof scenariosTable.$inferSelect | undefined;
  if (body.scenarioId) {
    [found] = await db.select().from(scenariosTable).where(
      and(eq(scenariosTable.id, body.scenarioId), eq(scenariosTable.companyId, ctx.companyId))
    );
    scenario = found ?? await getDefaultScenario(ctx.companyId);
  } else {
    scenario = await getDefaultScenario(ctx.companyId);
  }

  if (!scenario) {
    return errorResponse("No scenario found. Create a scenario first.", 404);
  }

  // AI-01: the WRITE target. Only an explicitly-selected, company-validated
  // scenario is a write target; base view (no body.scenarioId, or an unknown id)
  // writes to BASE tables (null) — never the Base-Case overlay that read-context
  // falls back to.
  const writeScenarioId = resolveWriteScenarioId(body.scenarioId, found ?? null);

  // Build financial context
  const { contextText: baseContextText } = await buildAiContext(ctx.companyId, {
    id: scenario.id,
    name: scenario.name,
    source: scenario.source ?? "blank",
  });

  // Inject scenario override context when a scenario is active
  const overrideCount = await getOverrideCount(scenario.id);
  const scenarioContext = overrideCount > 0
    ? `You are working inside scenario "${scenario.name}". ${overrideCount} changes from base.\nAll changes are overrides — base data will not be modified.\n\n`
    : "";
  const contextText = scenarioContext + baseContextText;

  // Load company's custom AI provider config (if any)
  const providerConfig = await getCompanyProviderConfig(ctx.companyId);

  const creditWarning = aiCheck.creditStatus?.warning
    ? `${aiCheck.creditStatus.percentUsed}% of monthly credits used`
    : undefined;

  const aiFlags = await getAiFlags(ctx.companyId);
  return buildChatSSEResponse({
    companyId: ctx.companyId,
    userId: ctx.userId,
    scenarioId: scenario.id,
    writeScenarioId,
    conversationId,
    messages,
    financialContext: contextText,
    companionName: aiFlags.companionName,
    providerConfig,
    defaults,
    sessionGrants,
    writeMode: aiCheck.writeMode ?? "confirm",
    creditWarning,
  });
});
