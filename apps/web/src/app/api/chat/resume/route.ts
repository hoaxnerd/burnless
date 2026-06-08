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
  type AiWriteMode,
} from "@burnless/ai";
import type { ContentBlock, InputFormSpec, FormField, PlanSpec } from "@burnless/ai"; // already exported from the package index
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { checkAiFeatureAllowed, getCompanyProviderConfig, getAiFlags } from "@/lib/ai-feature-flags";
import { executeToolCall, logDeniedToolCall } from "@/lib/ai-tools";
import { buildAiContext } from "@/lib/build-ai-context";
import { setTrackingCompanyId } from "@/lib/ai-usage-tracker";
import { buildChatSSEResponse, scenarioActivationFrom } from "@/lib/chat-stream";
import { NextResponse } from "next/server";
import { getActiveScenario, ScenarioSafetyError } from "@/lib/scenario-middleware";
import type { TimelineNode } from "@burnless/ai";

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

/** Build the seed timeline for a resumed turn: the lead-up + gate nodes persisted
 *  at pause-time, with THIS pause's gate marked resolved so it renders historical
 *  once `done` persists the full run (Plan 5). */
function buildSeedTimeline(timeline: unknown, pauseId: string): TimelineNode[] {
  const nodes = (Array.isArray(timeline) ? timeline : []) as TimelineNode[];
  return nodes.map((n) => {
    if (n.id !== pauseId) return n;
    if (n.plan) return { ...n, plan: { ...n.plan, resolved: true }, resolved: true };
    if (n.pending) return { ...n, pending: { ...n.pending, resolved: true }, resolved: true };
    if (n.input) return { ...n, input: { ...n.input, resolved: true }, resolved: true };
    return { ...n, resolved: true };
  });
}

/**
 * Rebuild the resume stream: load full conversation history, append the paused
 * assistant turn + a single user turn carrying ALL tool_result blocks
 * (completedResults + this resume's synthesized results), rebuild the scenario
 * financial context, re-resolve permission defaults / session grants / writeMode,
 * and hand off to the shared SSE responder. Shared by the input, plan, and
 * permission resume branches (spec §4.0 — resume is a fresh chatStream).
 */
async function resumeStream(args: {
  ctx: { companyId: string; userId: string };
  scenario: { id: string; name: string; source: string | null };
  writeScenarioId: string | null;
  conversationId: string;
  assistantBlocks: ContentBlock[];
  completedResults: ContentBlock[];
  resumeResults: ContentBlock[];
  writeMode?: AiWriteMode;
  seedTimeline?: TimelineNode[];
  activatedScenarios?: { scenarioId: string; name: string }[];
}): Promise<Response> {
  const { ctx, scenario, writeScenarioId, conversationId, assistantBlocks, completedResults, resumeResults, writeMode, seedTimeline, activatedScenarios } = args;

  const history = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt));
  const messages: ChatMessage[] = history
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  messages.push({ role: "assistant", content: assistantBlocks });
  messages.push({ role: "user", content: [...completedResults, ...resumeResults] });

  const { contextText: baseContext } = await buildAiContext(ctx.companyId, {
    id: scenario.id,
    name: scenario.name,
    source: scenario.source ?? "blank",
  });
  const overrideCount = await getOverrideCount(scenario.id);
  const financialContext =
    (overrideCount > 0
      ? `You are working inside scenario "${scenario.name}". ${overrideCount} changes from base.\nAll changes are overrides — base data will not be modified.\n\n`
      : "") + baseContext;

  const providerConfig = await getCompanyProviderConfig(ctx.companyId);
  const aiFlags = await getAiFlags(ctx.companyId);
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
    messages,
    financialContext,
    companionName: aiFlags.companionName,
    providerConfig,
    defaults,
    sessionGrants,
    writeMode: writeMode ?? "confirm",
    seedTimeline,
    activatedScenarios,
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

    return resumeStream({
      ctx: { companyId: ctx.companyId, userId: ctx.userId },
      scenario,
      writeScenarioId: pendingRow.writeScenarioId ?? null,
      conversationId: body.conversationId,
      assistantBlocks,
      completedResults,
      resumeResults: [inputResult],
      writeMode: aiCheck.writeMode ?? "confirm",
      seedTimeline: buildSeedTimeline(pendingRow.timeline, pendingRow.pauseId),
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

    return resumeStream({
      ctx: { companyId: ctx.companyId, userId: ctx.userId },
      scenario,
      writeScenarioId: pendingRow.writeScenarioId ?? null,
      conversationId: body.conversationId,
      assistantBlocks,
      completedResults,
      resumeResults: [planResult],
      writeMode: aiCheck.writeMode ?? "confirm",
      seedTimeline: buildSeedTimeline(pendingRow.timeline, pendingRow.pauseId),
    });
  }

  // PERMISSION pause (existing path): require decisions.
  if (!body.decisions || body.decisions.length === 0) {
    return errorResponse("decisions required to resume a permission pause", 400);
  }
  const pending = pendingRow.pending as PendingActionRecord[];
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
    const cat = categorizeToolName(a.toolName);
    return (cat === "write" || cat === "delete") && !NON_OVERLAY_MUTATIONS.has(a.toolName);
  });
  if (headerScenarioId && hasApprovedOverlayWrite && pendingRow.writeScenarioId && headerScenarioId !== pendingRow.scenarioId) {
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
          details: { pendingScenarioId: pendingRow.scenarioId, activeScenarioId: headerScenarioId, activeScenarioName: activeScn?.name ?? null },
        },
        { status: 409 },
      );
    }
  }

  // Execute / synthesize results for each pending action.
  const activatedScenarios: { scenarioId: string; name: string }[] = [];
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
      scenarioId: pendingRow.writeScenarioId ?? null,
      userId: ctx.userId,
      conversationId: body.conversationId,
      permissionDecision: decision === "session" ? "granted_session" : "granted_once",
    });
    pendingResults.push({ type: "tool_result", toolUseId: action.requestId, content: result });
    const activation = scenarioActivationFrom(action.toolName, result);
    if (activation) activatedScenarios.push(activation);
  }

  await resolvePendingAction(pendingRow.id);

  return resumeStream({
    ctx: { companyId: ctx.companyId, userId: ctx.userId },
    scenario,
    writeScenarioId: pendingRow.writeScenarioId ?? null,
    conversationId: body.conversationId,
    assistantBlocks,
    completedResults,
    resumeResults: pendingResults,
    writeMode: aiCheck.writeMode ?? "confirm",
    seedTimeline: buildSeedTimeline(pendingRow.timeline, pendingRow.pauseId),
    activatedScenarios,
  });
});
