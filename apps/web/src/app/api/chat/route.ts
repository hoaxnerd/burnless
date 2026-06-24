/**
 * POST /api/chat — Main AI chat endpoint with streaming responses.
 *
 * Accepts a user message + optional conversationId, streams Claude's response
 * back as Server-Sent Events. Handles tool calls server-side.
 */

import { z } from "zod";
import { db, getOverrideCount, getPermissionDefaults, getSessionGrants, getSessionDisabledTools, getDisabledBuiltinTools, appendTurnEvent, getOpenGate, resolveOpenGate, getTurnEvents } from "@burnless/db";
import { aiConversations, scenarios as scenariosTable } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { type ChatMessage, BUILTIN_PERMISSION_DEFAULTS, type PermissionDefaults, projectModelThread, type TurnEvent, DEFAULT_CONTEXT_HEADING } from "@burnless/ai";
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { checkAiFeatureAllowed, getCompanyProviderConfig, getAiFlags } from "@/lib/ai-feature-flags";
import { buildAiContext } from "@/lib/build-ai-context";
import { getDefaultScenario } from "@/lib/data";
import { resolveWriteScenarioId } from "@/lib/ai-write-target";
import { setTrackingCompanyId } from "@/lib/ai-usage-tracker";
import { buildChatSSEResponse } from "@/lib/chat-stream";
import { assembleMcpTools } from "@/lib/ai-tools/mcp";
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

  // Abandoning an open gate by sending a new message leaves
  // the gated (pending) tool_use without a tool_result — it would dangle forever in
  // the log and make Phase 3's projectModelThread emit an assistant turn with an
  // unpaired tool_use (provider 400). Before resolving the gate, synthesize a
  // `declined` cancellation tool_result for EACH gated tool_use, tagged with the
  // gate's OWN turnId so it groups with the abandoned turn (not the new one).
  // Gated-id source: permission gates carry their ids in `actions[].requestId`;
  // input/plan gates carry the single `gatedToolUseId`.
  const openGate = await getOpenGate(conversationId);
  if (openGate) {
    const gatePayload = openGate.payload as {
      kind?: "permission" | "input" | "plan";
      actions?: { requestId?: unknown }[];
      gatedToolUseId?: unknown;
    } | null;
    const gatedIds: string[] = [];
    if (gatePayload?.kind === "permission") {
      for (const a of gatePayload.actions ?? []) {
        if (typeof a?.requestId === "string") gatedIds.push(a.requestId);
      }
    } else if (typeof gatePayload?.gatedToolUseId === "string") {
      gatedIds.push(gatePayload.gatedToolUseId);
    }
    const cancelled = JSON.stringify({ declined: true, reason: "superseded by new message" });
    for (const toolUseId of gatedIds) {
      await appendTurnEvent({
        conversationId,
        turnId: openGate.turnId,
        type: "tool_result",
        payload: { toolUseId, toolName: "", result: cancelled, kind: "declined" },
      });
    }
  }

  // Resolve any open gate in the turn log before the new turn starts, so the new
  // turn's pause can't collide with the partial-unique open-gate index.
  // Unconditional (cheap no-op when no gate is open).
  await resolveOpenGate(conversationId);

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

  // Mint the turn id for this new turn. Threaded through to the streaming layer
  // so later tasks tag their log events with it (Phase 2 dual-write).
  const turnId = crypto.randomUUID();

  // Append the user_message event to the append-as-you-go turn log (aiTurnEvents)
  // — the sole conversation store. Runs AFTER the conversation row exists (valid FK).
  await appendTurnEvent({
    conversationId,
    turnId,
    type: "user_message",
    payload: { text: body.message },
  });

  // Build the model's conversation context from the
  // append-as-you-go turn-event log (aiTurnEvents).
  // The current turn's user_message was appended above (Task 2.1), so it's the
  // latest event in the log and projectModelThread includes it as the final
  // user turn. The projected thread is the exact provider message thread —
  // every assistant tool_use is paired with a tool_result (Phase 2 invariant),
  // so it's a valid provider thread. No cap: the old aiMessages read projected
  // the full thread (no LIMIT), and the loop fix needs the complete thread.
  // System prompt + financial snapshot are added separately by chatStream/context.
  // getTurnEvents returns drizzle rows (payload: unknown) — cast to the typed
  // TurnEvent shape. projectModelThread only ever emits user/assistant turns, so
  // the LlmMessage[] result is a valid ChatMessage[] for the streaming layer.
  const messages = projectModelThread(
    (await getTurnEvents(conversationId)) as unknown as TurnEvent[]
  ) as ChatMessage[];

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
  const { contextText: baseContextText, nowContext } = await buildAiContext(ctx.companyId, {
    id: scenario.id,
    name: scenario.name,
    source: scenario.source ?? "blank",
  });

  // Inject scenario override context when a scenario is active
  const overrideCount = await getOverrideCount(scenario.id);
  const scenarioContext = overrideCount > 0
    ? `You are working inside scenario "${scenario.name}". ${overrideCount} changes from base.\nAll changes are overrides — base data will not be modified.\n\n`
    : "";

  // Registry: resolve tools, prompt sections, AND context sections through the
  // DomainRegistry so future domains (e.g. company-knowledge) automatically
  // contribute their sections without touching this route.
  //
  // Dynamic import keeps domains/finance.ts out of the module parse graph so
  // existing test mocks of @/lib/ai-tools (which finance.ts references) work.
  //
  // buildAiContext above is kept for nowContext (and cache-priming); the finance
  // contributor internally re-calls buildAiContext — React.cache / unstable_cache
  // deduplicates the heavy work (computeDashboardData, cachedQuery) within the request.
  const { domainRegistry } = await import("@/lib/domains");
  const domainCtx = { companyId: ctx.companyId };
  const contributeCtx = {
    companyId: ctx.companyId,
    scenarioId: scenario.id,
    scenarioRef: { id: scenario.id, name: scenario.name, source: scenario.source ?? "blank" },
  };
  const [baseTools, promptSections, contributors] = await Promise.all([
    domainRegistry.getActiveTools(domainCtx),
    domainRegistry.getActivePromptSections(domainCtx),
    domainRegistry.getActiveContextContributors(domainCtx),
  ]);
  const rawSections = (await Promise.all(contributors.map((c) => c.sections(contributeCtx)))).flat();
  // Prepend the scenario-override prefix to the first DEFAULT_CONTEXT_HEADING section
  // (the finance snapshot) — identical to the single-block behaviour before this change.
  const contextSections = rawSections.map((s, i) =>
    i === 0 && s.heading === DEFAULT_CONTEXT_HEADING
      ? { ...s, body: scenarioContext + s.body }
      : s
  );

  // Load company's custom AI provider config (if any)
  const providerConfig = await getCompanyProviderConfig(ctx.companyId);

  const creditWarning = aiCheck.creditStatus?.warning
    ? `${aiCheck.creditStatus.percentUsed}% of monthly credits used`
    : undefined;

  const aiFlags = await getAiFlags(ctx.companyId);

  // Disabled-tools overlay (S3b §11): permanently-disabled built-ins (user prefs)
  // ∪ session-disabled built-ins (this conversation's `builtin:` keys). The MCP
  // `conn:`/`conntool:` keys are handled inside assembleMcpTools below.
  const sessionDisabled = await getSessionDisabledTools(conversationId);
  const disabledBuiltins = await getDisabledBuiltinTools(ctx.userId, ctx.companyId);
  const disabledToolNames = new Set<string>([
    ...disabledBuiltins,
    ...Object.keys(sessionDisabled)
      .filter((k) => k.startsWith("builtin:"))
      .map((k) => k.slice("builtin:".length)),
  ]);

  // MCP tools for this turn (spec §3.4): cached capabilities only — no live
  // server round-trips here. Empty when the feature is off or nothing connected.
  // aiFlags is passed pre-fetched so the aiFeatureFlags row isn't re-queried.
  // sessionDisabled drops `conn:`/`conntool:` session-disabled connections/tools.
  const mcp = await assembleMcpTools(ctx.companyId, ctx.userId, aiFlags, sessionDisabled);

  return buildChatSSEResponse({
    companyId: ctx.companyId,
    userId: ctx.userId,
    scenarioId: scenario.id,
    writeScenarioId,
    conversationId,
    turnId,
    messages,
    contextSections,
    baseTools,
    promptSections,
    companionName: aiFlags.companionName,
    providerConfig,
    defaults,
    sessionGrants,
    writeMode: aiCheck.writeMode ?? "confirm",
    mcp,
    disabledToolNames,
    creditWarning,
    nowContext,
  });
});
