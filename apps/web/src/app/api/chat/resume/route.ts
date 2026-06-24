// apps/web/src/app/api/chat/resume/route.ts
/**
 * POST /api/chat/resume — resume a paused assistant turn after the user decides
 * on the pending tool actions. Executes approved tools, synthesizes results for
 * denied ones, reconstructs history, and re-streams via the shared responder.
 */
import { z } from "zod";
import {
  db,
  grantSessionPermission,
  getSessionGrants,
  getPermissionDefaults,
  getOverrideCount,
  getSessionDisabledTools,
  getDisabledBuiltinTools,
  getOpenGate,
  resolveOpenGate,
  getTurnEvents,
  appendTurnEvent,
} from "@burnless/db";
import { aiConversations, scenarios as scenariosTable } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import {
  categorizeToolName,
  BUILTIN_PERMISSION_DEFAULTS,
  projectModelThread,
  DEFAULT_CONTEXT_HEADING,
  type ChatMessage,
  type PermissionDefaults,
  type AiWriteMode,
  type TurnEvent,
} from "@burnless/ai";
import type { ContentBlock, InputFormSpec, FormField, PlanSpec } from "@burnless/ai"; // already exported from the package index
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { checkAiFeatureAllowed, getCompanyProviderConfig, getAiFlags } from "@/lib/ai-feature-flags";
import { executeToolCall, logDeniedToolCall } from "@/lib/ai-tools";
import { assembleMcpTools, type AssembledMcpTools } from "@/lib/ai-tools/mcp";
import { buildAiContext } from "@/lib/build-ai-context";
import { setTrackingCompanyId } from "@/lib/ai-usage-tracker";
import { buildChatSSEResponse, scenarioActivationFrom } from "@/lib/chat-stream";
import { NextResponse } from "next/server";
import { getActiveScenario, ScenarioSafetyError } from "@/lib/scenario-middleware";

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

/** Dual-write (Task 2.3): append the resume's synthesized decision results to the
 *  turn log, reusing the OPEN GATE's turnId so the resumed events share the gate's
 *  turn (finding #7). Denied stubs (content carries `{declined:true}`) record
 *  kind:"declined"; everything else (approved tool output, submitted form, approved
 *  plan) records kind:"executed". Best-effort: a failing append must not block the
 *  resume. The gate is resolved by the caller AFTER this. */
async function appendResumeResults(
  conversationId: string,
  turnId: string,
  results: ContentBlock[],
): Promise<void> {
  for (const block of results) {
    if (block.type !== "tool_result") continue;
    const b = block as { toolUseId?: string; content?: string };
    if (typeof b.toolUseId !== "string") continue;
    let kind: "executed" | "declined" = "executed";
    try {
      const parsed = JSON.parse(b.content ?? "") as { declined?: boolean };
      if (parsed?.declined) kind = "declined";
    } catch {
      /* non-JSON content → treat as an executed result */
    }
    await appendTurnEvent({
      conversationId,
      turnId,
      type: "tool_result",
      payload: { toolUseId: b.toolUseId, toolName: "", result: b.content ?? "", kind },
    }).catch(() => {});
  }
}

/**
 * Rebuild the resume stream. The model thread is projected from the durable
 * turn-event log (`aiTurnEvents`) — the COMPLETE, lossless thread regardless of
 * how many times this turn paused (Phase 3 loop fix). Every prior pause's
 * tool_use is already paired with its tool_result in the log (Phase 2
 * invariant; the decision results for THIS pause are appended by the caller
 * BEFORE this runs), so the projection is a valid provider thread that still
 * carries every completed step. This REPLACES the old aiMessages history +
 * assistantBlocks/completedResults reconstruction, which dropped tool calls
 * completed in an earlier resume segment and looped the model.
 *
 * Rebuilds the scenario financial context, re-resolves permission defaults /
 * session grants / writeMode, and hands off to the shared SSE responder. Shared
 * by the input, plan, and permission resume branches (spec §4.0 — resume is a
 * fresh chatStream). Reuses the gate's own turnId so the continuation's events
 * group with the paused turn (one turn group; review finding #7).
 */
async function resumeStream(args: {
  ctx: { companyId: string; userId: string };
  scenario: { id: string; name: string; source: string | null };
  writeScenarioId: string | null;
  conversationId: string;
  /** The gate's turnId — reused so the resumed turn's events share the gate's turn. */
  turnId: string;
  writeMode?: AiWriteMode;
  /** Companion name from the POST handler's getAiFlags (fetched once per turn). */
  companionName: string;
  /** MCP tools + dynamic category map, assembled ONCE in the POST handler and
   *  shared with the decision loop (spec §3.4). */
  mcp: AssembledMcpTools;
  /** Built-in tools disabled for this turn (S3b §11); resumes re-offer tools. */
  disabledToolNames?: ReadonlySet<string>;
}): Promise<Response> {
  const { ctx, scenario, writeScenarioId, conversationId, turnId, writeMode, companionName, mcp, disabledToolNames } = args;

  // Project the COMPLETE provider thread from the append-as-you-go turn-event
  // log. The caller has already appended this resume's decision tool_result(s)
  // (appendResumeResults), so they are in the log before this projection runs —
  // the resumed model sees the approved/denied results alongside every prior
  // pause's completed work. projectModelThread only ever emits user/assistant
  // turns, so the LlmMessage[] is a valid ChatMessage[] for the streaming layer.
  const messages = projectModelThread(
    (await getTurnEvents(conversationId)) as unknown as TurnEvent[]
  ) as ChatMessage[];

  // buildAiContext is retained for nowContext (+ cache-priming); the context body now comes from getActiveContextContributors
  const { nowContext } = await buildAiContext(ctx.companyId, {
    id: scenario.id,
    name: scenario.name,
    source: scenario.source ?? "blank",
  });
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

  const providerConfig = await getCompanyProviderConfig(ctx.companyId);
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

  return buildChatSSEResponse({
    companyId: ctx.companyId,
    userId: ctx.userId,
    scenarioId: scenario.id,
    writeScenarioId,
    conversationId,
    // Reuse the gate's own turnId: the continuation's log events (assistant_step,
    // tool_result, turn_done) share the paused turn's id, so projectTimeline keeps
    // the whole multi-pause turn as ONE group (review finding #7).
    turnId,
    messages,
    contextSections,
    baseTools,
    promptSections,
    companionName,
    providerConfig,
    defaults,
    sessionGrants,
    writeMode: writeMode ?? "confirm",
    mcp,
    disabledToolNames,
    nowContext,
  });
}

export const POST = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "chat");
  if (blocked) return blocked;

  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  setTrackingCompanyId(ctx.companyId);

  // Dual-channel scenario safety (spec §6 decision 4): the cookie + X-Scenario-Id
  // header must agree. apiFetch keeps them in lockstep, so this only fires on a
  // genuine drift. Returns the active scenario id (null in base view).
  let headerScenarioId: string | null;
  try {
    headerScenarioId = getActiveScenario(request);
  } catch (e) {
    return errorResponse(e instanceof ScenarioSafetyError ? e.message : "Scenario channel mismatch", 409);
  }

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

  // The open gate event is the SOLE source of truth for gate metadata: its turnId
  // (reused so the resumed events share the paused turn — finding #7), kind, the
  // gated actions/spec, and the persisted read/write scenario ids. The gate is
  // written for every pause in chat-stream's onPause/onInputRequest/onPlanRequest,
  // so a paused turn always has exactly one open gate. Verify the client's pauseId
  // matches the open gate's pauseId (the gate's own payload carries it).
  const openGate = await getOpenGate(body.conversationId);
  const gatePayload = (openGate?.payload ?? null) as {
    pauseId?: string;
    kind?: "permission" | "input" | "plan";
    actions?: unknown[];
    spec?: unknown;
    gatedToolUseId?: string;
    scenarioId?: string;
    writeScenarioId?: string | null;
  } | null;
  if (!openGate || gatePayload?.pauseId !== body.pauseId) {
    return errorResponse("No matching pending action to resume", 409);
  }

  const gateTurnId = openGate.turnId;
  // Gate metadata: kind drives the branch; scenarioId/writeScenarioId drive
  // scenario targeting + the decision-4 re-confirm.
  const gateKind = gatePayload!.kind as "permission" | "input" | "plan";
  const gateReadScenarioId = gatePayload!.scenarioId!;
  const gateWriteScenarioId = gatePayload!.writeScenarioId ?? null;

  // SCENARIO SAFETY: execute held tools against the scenario the turn was paused in
  // (from the gate, with a pending-row fallback), loaded scoped to the company —
  // NOT getDefaultScenario. A pause inside a non-default scenario must resume into
  // that same overlay (spec §5).
  const [scenario] = await db
    .select()
    .from(scenariosTable)
    .where(and(eq(scenariosTable.id, gateReadScenarioId), eq(scenariosTable.companyId, ctx.companyId)));
  if (!scenario) return errorResponse("Scenario for the paused turn not found", 404);

  // Flags fetched ONCE per resume (checkAiFeatureAllowed has its own internal read;
  // this is the only other one). MCP tools + dynamic category map are assembled here
  // — same assembly as POST /api/chat so the model keeps its MCP tool set across a
  // pause — and shared by the decision loop AND the resumed stream (spec §3.4).
  const aiFlags = await getAiFlags(ctx.companyId);

  // Disabled-tools overlay (S3b §11) — resumes re-offer the tool set, so apply the
  // same filter as POST /api/chat. `builtin:` keys → disabledToolNames (filtered in
  // the chat loop); `conn:`/`conntool:` keys → assembleMcpTools.
  const sessionDisabled = await getSessionDisabledTools(body.conversationId);
  const disabledBuiltins = await getDisabledBuiltinTools(ctx.userId, ctx.companyId);
  const disabledToolNames = new Set<string>([
    ...disabledBuiltins,
    ...Object.keys(sessionDisabled)
      .filter((k) => k.startsWith("builtin:"))
      .map((k) => k.slice("builtin:".length)),
  ]);

  const mcp = await assembleMcpTools(ctx.companyId, ctx.userId, aiFlags, sessionDisabled);

  // INPUT pause (genui plan 1): validate the submitted formData against the stored
  // spec, synthesize a single tool_result for the form's tool_use id, and resume
  // the loop. No permission decisions are involved (spec §7 — input and permission
  // pauses are exclusive).
  if (gateKind === "input") {
    // The input spec + gated tool_use id come from the gate event.
    const inputToolUseId = gatePayload!.gatedToolUseId!;
    const spec = gatePayload!.spec as InputFormSpec;
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
      toolUseId: inputToolUseId,
      content: JSON.stringify(formData),
    };
    // Append the decision result to the log BEFORE projecting (resumeStream),
    // so the projected thread includes the submitted form result.
    await appendResumeResults(body.conversationId, gateTurnId, [inputResult]);
    await resolveOpenGate(body.conversationId);

    return resumeStream({
      ctx: { companyId: ctx.companyId, userId: ctx.userId },
      scenario,
      writeScenarioId: gateWriteScenarioId,
      conversationId: body.conversationId,
      turnId: gateTurnId,
      writeMode: aiCheck.writeMode ?? "confirm",
      companionName: aiFlags.companionName,
      mcp,
      disabledToolNames,
    });
  }

  // PLAN pause (worklog plan 1): the user approved/edited the proposed plan.
  // Synthesize a tool_result for the propose_plan tool_use id carrying the
  // approved plan, then resume — the model proceeds to call the real tools
  // (which themselves hit the permission/diff gate). Exclusive with input/permission.
  if (gateKind === "plan") {
    // The proposed plan spec + gated tool_use id come from the gate event.
    const planToolUseId = gatePayload!.gatedToolUseId!;
    const approvedPlan = (body.plan as PlanSpec | undefined) ?? (gatePayload!.spec as PlanSpec);

    const planResult: ContentBlock = {
      type: "tool_result",
      toolUseId: planToolUseId,
      content: JSON.stringify({ approved: true, plan: approvedPlan }),
    };
    // Append the decision result to the log BEFORE projecting (resumeStream).
    await appendResumeResults(body.conversationId, gateTurnId, [planResult]);
    await resolveOpenGate(body.conversationId);

    return resumeStream({
      ctx: { companyId: ctx.companyId, userId: ctx.userId },
      scenario,
      writeScenarioId: gateWriteScenarioId,
      conversationId: body.conversationId,
      turnId: gateTurnId,
      writeMode: aiCheck.writeMode ?? "confirm",
      companionName: aiFlags.companionName,
      mcp,
      disabledToolNames,
    });
  }

  // PERMISSION pause (existing path): require decisions.
  if (!body.decisions || body.decisions.length === 0) {
    return errorResponse("decisions required to resume a permission pause", 400);
  }
  // The gated action batch comes from the gate event's `actions` (the enriched
  // pending batch — {requestId, toolName, toolInput, override?}).
  const pending = (gatePayload!.actions ?? []) as PendingActionRecord[];
  const decisionMap = new Map(body.decisions.map((d) => [d.requestId, d.decision]));

  // Decision 4 (spec §6): re-confirm the user is still in the scenario this turn
  // paused in before committing an OVERLAY write. Tolerate a mismatch only when the
  // active scenario was created by THIS conversation (the AI activated its own new
  // scenario — not a user switch). Otherwise surface a "scenario changed" prompt
  // instead of silently committing to the old overlay.
  //
  // Gate ONLY when the user asserts an active scenario via the header AND at least one
  // APPROVED action actually writes that scenario's overlay. Rationale:
  //   - No header → true base view (no scenario channel) → not signalling a switch;
  //     the resume still targets the persisted overlay (§5), nothing to re-confirm.
  //   - Non-overlay mutations (create/update/delete_scenario, funding-investor) write
  //     company-scoped tables, NOT the overlay, so a mid-turn scenario switch doesn't
  //     endanger them — gating them false-positives (e.g. the AI activates an existing
  //     scenario then creates a NEW one in the same turn).
  //   - A declined action never commits, so Deny/Cancel must always pass through.
  const NON_OVERLAY_MUTATIONS = new Set<string>([
    "create_scenario", "update_scenario", "delete_scenario", "create_funding_round_investor",
  ]);
  const hasApprovedOverlayWrite = pending.some((a) => {
    const d = decisionMap.get(a.requestId) ?? "deny";
    if (d === "deny") return false;
    // External MCP tools write EXTERNAL systems, never the scenario overlay — a
    // mid-pause scenario switch can't endanger them, so they never arm the gate.
    if (a.toolName.startsWith("mcp__")) return false;
    const cat = categorizeToolName(a.toolName, mcp.categories);
    return (cat === "write" || cat === "delete") && !NON_OVERLAY_MUTATIONS.has(a.toolName);
  });
  // Decision-4 reads the read/write scenario ids from the GATE (gate-preferred,
  // pending-row fallback) — the paused turn's persisted overlay target.
  if (headerScenarioId && hasApprovedOverlayWrite && gateWriteScenarioId && headerScenarioId !== gateReadScenarioId) {
    const [activeScn] = await db
      .select({ aiConversationId: scenariosTable.aiConversationId, name: scenariosTable.name })
      .from(scenariosTable)
      .where(and(eq(scenariosTable.id, headerScenarioId), eq(scenariosTable.companyId, ctx.companyId)));
    const tolerated = activeScn?.aiConversationId === body.conversationId;
    if (!tolerated) {
      return NextResponse.json(
        {
          error: "The active scenario changed since this action was proposed.",
          code: "SCENARIO_CHANGED",
          details: { pendingScenarioId: gateReadScenarioId, activeScenarioId: headerScenarioId, activeScenarioName: activeScn?.name ?? null },
        },
        { status: 409 },
      );
    }
  }

  // Execute / synthesize results for each pending action.
  const pendingResults: ContentBlock[] = [];
  // The continuation's write target. Seeded from the gate's original target
  // (the scenario the turn paused in), but RE-POINTED when an approved action
  // activates a new scenario mid-batch — so post-activation writes in the
  // continuation land in the just-created scenario, not the previously-active
  // one (A+B). "Last activation wins" mirrors chat-stream's onToolCall, which
  // overwrites turnScenarioId on each activation.
  let nextWriteScenarioId = gateWriteScenarioId;
  for (const action of pending) {
    const decision = decisionMap.get(action.requestId) ?? "deny";
    // Dynamic map first (MCP): the granted category must match what the
    // permission card showed (e.g. an MCP refund classified "delete").
    const category = categorizeToolName(action.toolName, mcp.categories);

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

    // Execute against the RUNNING write target, not the gate's fixed original:
    // an approved action EARLIER in this same batch may have activated a new
    // scenario (nextWriteScenarioId re-pointed below), so later same-batch
    // overlay writes must land in the just-created scenario (A+B same-batch
    // variant). create_scenario isn't scenario-scoped, so executing the
    // activating action itself against the old target is irrelevant.
    const result = await executeToolCall(action.toolName, action.toolInput, {
      companyId: ctx.companyId,
      scenarioId: nextWriteScenarioId,
      userId: ctx.userId,
      conversationId: body.conversationId,
      permissionDecision: decision === "session" ? "granted_session" : "granted_once",
    });
    pendingResults.push({ type: "tool_result", toolUseId: action.requestId, content: result });
    // A scenario the AI created/activated while executing this approved batch is
    // recorded as a persisted scenario marker on the gate's turn (replaces the dead
    // `activatedScenarios` chat-stream plumbing) so the projected timeline/history
    // shows the activation. The live re-enter SSE is emitted by the continuing
    // chatStream when it re-evaluates the thread; here we only persist the marker.
    const activation = scenarioActivationFrom(action.toolName, result);
    if (activation) {
      // Re-target the continuation: a scenario created/activated by this approved
      // batch becomes the write target for the resumed stream's subsequent writes.
      nextWriteScenarioId = activation.scenarioId;
      await appendTurnEvent({
        conversationId: body.conversationId,
        turnId: gateTurnId,
        type: "scenario",
        payload: { action: "activated", scenarioId: activation.scenarioId, name: activation.name },
      }).catch(() => {});
    }
  }

  await appendResumeResults(body.conversationId, gateTurnId, pendingResults);
  await resolveOpenGate(body.conversationId);

  return resumeStream({
    ctx: { companyId: ctx.companyId, userId: ctx.userId },
    scenario,
    writeScenarioId: nextWriteScenarioId,
    conversationId: body.conversationId,
    turnId: gateTurnId,
    writeMode: aiCheck.writeMode ?? "confirm",
    companionName: aiFlags.companionName,
    mcp,
    disabledToolNames,
  });
});
