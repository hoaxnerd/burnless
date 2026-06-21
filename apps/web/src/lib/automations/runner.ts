/**
 * Bounded agent runner (S3a Plan 4 §4). Runs a scheduled job as a capped,
 * headless reuse of the chat tool-loop, constrained to the job's FROZEN tool
 * allowlist. No live session: all context (companyId, createdByUserId, audit
 * link) is explicit. Mirrors the headless precedent in lib/cron/batch-regenerate.ts.
 */
import { MUTATION_TOOL_NAMES, getFinancialTools, chat, type ToolDefinition, type ChatMessage } from "@burnless/ai";
import {
  getScheduledJobById,
  startScheduledJobRun,
  finishScheduledJobRun,
  updateScheduledJob,
  createNotification,
  type ScheduledJobNotifyPolicy,
  type ScheduledJobRunTrigger,
} from "@burnless/db";
import { executeToolCall } from "@/lib/ai-tools";
import type { ToolContext } from "@/lib/ai-tools/types";
import { checkAiFeatureAllowed, getCompanyProviderConfig } from "@/lib/ai-feature-flags";
import { setTrackingCompanyId } from "@/lib/ai-usage-tracker";
import { getDefaultScenario } from "@/lib/data";
import { buildAiContext } from "@/lib/build-ai-context";
import { assembleMcpTools } from "@/lib/ai-tools/mcp";
import { getSafetyLimits, computeNextRunAt, shouldAutoDisable } from "./safety";
import { logger } from "@/lib/logger";

const log = logger("automations-runner");

/** Frozen toolset offered to the provider: allowlisted financial + (pre-filtered) MCP tools. */
export function assembleAllowedTools(allowedTools: string[], mcpTools: ToolDefinition[]): ToolDefinition[] {
  const allow = new Set(allowedTools);
  const financial = getFinancialTools().filter((t) => allow.has(t.name));
  const mcp = mcpTools.filter((t) => allow.has(t.name));
  return [...financial, ...mcp];
}

export interface DispatchOptions {
  dryRun: boolean;
  allowedNames: Set<string>;
}

/**
 * Build the `onToolCall` the chat loop invokes per tool_use.
 * - commit: real execution (mode "commit").
 * - dry-run: mutation tools are SUPPRESSED (never executed → zero writes, for
 *   base-table AND facade tools); read tools run in plan mode so the model can
 *   describe the would-be change.
 * - allowlist guard: a tool outside the set is refused (defense-in-depth).
 */
export function makeOnToolCall(
  ctx: ToolContext,
  opts: DispatchOptions
): (toolName: string, input: Record<string, unknown>) => Promise<string> {
  return async (toolName, input) => {
    if (!opts.allowedNames.has(toolName)) {
      return JSON.stringify({ error: `Tool "${toolName}" is not in this job's allowlist.` });
    }
    const isMutation = MUTATION_TOOL_NAMES.has(toolName);
    if (opts.dryRun && isMutation) {
      return JSON.stringify({
        dryRun: true,
        suppressed: true,
        tool: toolName,
        input,
        note: "DRY RUN — no data was written. Describe to the user what this change WOULD do on a real run.",
      });
    }
    return executeToolCall(toolName, input, { ...ctx, mode: opts.dryRun ? "plan" : "commit" });
  };
}

// ── orchestration ─────────────────────────────────────────────────────────────

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(`Run timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t!);
  }
}

function composePrompt(job: { prompt: string; lastRunCursor: Record<string, unknown> | null }): string {
  const cursor = job.lastRunCursor
    ? `\n\n[Context from your last run: ${JSON.stringify(job.lastRunCursor)}. Use this to avoid duplicating work already done.]`
    : "";
  return job.prompt + cursor;
}

function deriveSummary(result: { response: string }): string {
  const first = result.response.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "Run complete.";
  return first.slice(0, 240);
}

/** A write run "changed something" if any mutation tool ran (its result wasn't an error/no-op envelope). */
function didChange(result: { toolResults: { tool: string; result: string }[] }): boolean {
  return result.toolResults.some((r) => {
    if (!MUTATION_TOOL_NAMES.has(r.tool)) return false; // a read tool never "changes" data
    try {
      const j = JSON.parse(r.result);
      return !j.error && !j.planned && !j.suppressed;
    } catch {
      return false;
    }
  });
}

function shouldNotify(
  policy: ScheduledJobNotifyPolicy,
  outcome: { kind: "success" | "failed" | "auto_disabled"; actionKind: "write" | "notify"; changed: boolean }
): boolean {
  if (policy === "off") return false;
  // policy is now one of smart | failures | every — all of which surface failures.
  if (outcome.kind === "failed" || outcome.kind === "auto_disabled") return true;
  if (policy === "every") return true;
  if (policy === "failures") return false; // success not notified
  // smart:
  if (outcome.actionKind === "notify") return true; // notify-only jobs always report
  return outcome.changed; // write jobs only when they actually changed something
}

export type RunResult = {
  response: string;
  toolResults: { tool: string; input: Record<string, unknown>; result: string }[];
};

export type RunOutcome = {
  run: { id: string };
  result: RunResult | null;
  status: "success" | "failed";
};

/**
 * Run a persisted scheduled job once (S3a Plan 4 §4). Headless, bounded, no
 * live session. Gates (credits + write-mode) → record run → capped chat loop
 * over the frozen allowlist → finish run → recompute nextRunAt / failure
 * counters / auto-disable → notify per policy. A `dry_run` trigger never
 * mutates the job and never notifies — the run row + result are the whole output.
 */
export async function runScheduledJob(jobId: string, trigger: ScheduledJobRunTrigger): Promise<RunOutcome> {
  const job = await getScheduledJobById(jobId);
  if (!job) throw new Error(`scheduled job ${jobId} not found`);
  const isDryRun = trigger === "dry_run";
  const limits = getSafetyLimits();
  const run = await startScheduledJobRun({ scheduledJobId: job.id, companyId: job.companyId, trigger });
  if (!run) throw new Error(`failed to start run for scheduled job ${jobId}`);

  const notify = async (severity: "info" | "success" | "warning" | "error", title: string, body: string) => {
    if (isDryRun) return;
    await createNotification({
      companyId: job.companyId,
      userId: job.createdByUserId,
      category: "automation",
      title,
      body,
      severity,
      link: `/automations/${job.id}`,
      metadata: { scheduledJobId: job.id, runId: run.id },
    });
  };
  const advanceSchedule = async (patch: Record<string, unknown>) => {
    if (isDryRun) return; // dry runs never mutate the job
    const next = computeNextRunAt(job.schedule, new Date(), job.timezone ?? "UTC");
    await updateScheduledJob(job.id, job.companyId, { lastRunAt: new Date(), nextRunAt: next, ...patch });
  };

  // ── gates ──
  const aiCheck = await checkAiFeatureAllowed(job.companyId, "chat");
  if (!aiCheck.allowed) {
    await finishScheduledJobRun(run.id, job.companyId, { status: "failed", error: aiCheck.reason ?? "AI not allowed" });
    await advanceSchedule({});
    if (shouldNotify(job.notifyPolicy, { kind: "failed", actionKind: job.actionKind, changed: false }))
      await notify("error", `${job.name} skipped`, aiCheck.reason ?? "AI not available");
    return { run, result: null, status: "failed" };
  }
  if (job.actionKind === "write" && aiCheck.writeMode === "read_only") {
    await finishScheduledJobRun(run.id, job.companyId, { status: "failed", error: "AI write-mode is read_only" });
    await advanceSchedule({});
    if (shouldNotify(job.notifyPolicy, { kind: "failed", actionKind: job.actionKind, changed: false }))
      await notify("warning", `${job.name} could not write`, "This automation writes data, but AI write-mode is read-only.");
    return { run, result: null, status: "failed" };
  }

  setTrackingCompanyId(job.companyId);

  try {
    const scenario = await getDefaultScenario(job.companyId);
    const { contextText, nowContext } = await buildAiContext(
      job.companyId,
      scenario
        ? { id: scenario.id, name: scenario.name, source: scenario.source }
        : { id: "base", name: "Base", source: "blank" }
    );
    const providerConfig = await getCompanyProviderConfig(job.companyId);
    const { tools: mcpTools } = await assembleMcpTools(job.companyId, job.createdByUserId);
    const toolsOverride = assembleAllowedTools(job.allowedTools, mcpTools);

    if (job.allowedTools.length > 0 && toolsOverride.length === 0) {
      await finishScheduledJobRun(run.id, job.companyId, {
        status: "failed",
        error: "Required tools unavailable (connection removed?)",
      });
      await advanceSchedule({});
      await notify("error", `${job.name} is under-equipped`, "A tool this automation needs is no longer available.");
      return { run, result: null, status: "failed" };
    }

    const ctx: ToolContext = {
      companyId: job.companyId,
      userId: job.createdByUserId,
      scenarioId: scenario?.id ?? null,
      auditSource: "scheduled_job",
      scheduledJobRunId: run.id,
    };
    const messages: ChatMessage[] = [{ role: "user", content: composePrompt(job) }];
    const result = await withTimeout(
      chat({
        messages,
        financialContext: contextText,
        mode: "autonomous",
        companionName: undefined,
        toolsOverride,
        providerConfig,
        nowContext,
        onToolCall: makeOnToolCall(ctx, { dryRun: isDryRun, allowedNames: new Set(job.allowedTools) }),
      }),
      isDryRun ? limits.dryRunTimeoutMs : limits.runTimeoutMs
    );

    const changed = didChange(result);
    await finishScheduledJobRun(run.id, job.companyId, {
      status: "success",
      summary: deriveSummary(result),
      output: { response: result.response, toolResults: result.toolResults },
    });
    await advanceSchedule({
      consecutiveFailures: 0,
      status: "active",
      lastRunCursor: { lastRunAt: new Date().toISOString(), summary: deriveSummary(result) },
    });
    if (shouldNotify(job.notifyPolicy, { kind: "success", actionKind: job.actionKind, changed }))
      await notify("success", `${job.name} ran`, deriveSummary(result));
    return { run, result, status: "success" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.warn({ jobId, error }, "scheduled job failed");
    await finishScheduledJobRun(run.id, job.companyId, { status: "failed", error });
    if (!isDryRun) {
      const nextFailures = job.consecutiveFailures + 1;
      if (shouldAutoDisable(nextFailures)) {
        await updateScheduledJob(job.id, job.companyId, {
          consecutiveFailures: nextFailures,
          status: "auto_disabled",
          enabled: false,
          lastRunAt: new Date(),
        });
        if (shouldNotify(job.notifyPolicy, { kind: "auto_disabled", actionKind: job.actionKind, changed: false }))
          await notify("error", `${job.name} auto-disabled`, `Failed ${nextFailures} times in a row. Re-enable it after fixing the cause.`);
      } else {
        await advanceSchedule({ consecutiveFailures: nextFailures });
        if (shouldNotify(job.notifyPolicy, { kind: "failed", actionKind: job.actionKind, changed: false }))
          await notify("error", `${job.name} failed`, error.slice(0, 240));
      }
    }
    return { run, result: null, status: "failed" };
  }
}

export interface JobDraft {
  companyId: string;
  createdByUserId: string;
  prompt: string;
  actionKind: "write" | "notify";
  allowedTools: string[];
  boundConnectionIds: string[];
}

/** Read-only preview for a NOT-yet-saved draft (proposal card). Never writes, never persists a job or run mutation. */
export async function dryRunJobDraft(draft: JobDraft): Promise<{ response: string; toolResults: unknown[] }> {
  const aiCheck = await checkAiFeatureAllowed(draft.companyId, "chat");
  if (!aiCheck.allowed) return { response: aiCheck.reason ?? "AI not available.", toolResults: [] };
  setTrackingCompanyId(draft.companyId);
  const scenario = await getDefaultScenario(draft.companyId);
  const { contextText, nowContext } = await buildAiContext(
    draft.companyId,
    scenario
      ? { id: scenario.id, name: scenario.name, source: scenario.source }
      : { id: "base", name: "Base", source: "blank" }
  );
  const providerConfig = await getCompanyProviderConfig(draft.companyId);
  const { tools: mcpTools } = await assembleMcpTools(draft.companyId, draft.createdByUserId);
  const toolsOverride = assembleAllowedTools(draft.allowedTools, mcpTools);
  const ctx: ToolContext = {
    companyId: draft.companyId,
    userId: draft.createdByUserId,
    scenarioId: scenario?.id ?? null,
    auditSource: "scheduled_job",
  };
  const result = await withTimeout(
    chat({
      messages: [{ role: "user", content: draft.prompt }],
      financialContext: contextText,
      mode: "autonomous",
      toolsOverride,
      providerConfig,
      nowContext,
      onToolCall: makeOnToolCall(ctx, { dryRun: true, allowedNames: new Set(draft.allowedTools) }),
    }),
    getSafetyLimits().dryRunTimeoutMs
  );
  return { response: result.response, toolResults: result.toolResults };
}

/** Run a NOT-yet-saved draft ONCE for real (writes commit). Persists no job/run row; honors credit + write-mode gates. */
export async function runJobDraftForReal(draft: JobDraft): Promise<{ response: string; toolResults: unknown[]; error?: string }> {
  const aiCheck = await checkAiFeatureAllowed(draft.companyId, "chat");
  if (!aiCheck.allowed) return { response: aiCheck.reason ?? "AI not available.", toolResults: [], error: aiCheck.reason };
  if (draft.actionKind === "write" && aiCheck.writeMode === "read_only")
    return { response: "AI write-mode is read-only; this automation can't write.", toolResults: [], error: "read_only" };
  setTrackingCompanyId(draft.companyId);
  const scenario = await getDefaultScenario(draft.companyId);
  const { contextText, nowContext } = await buildAiContext(
    draft.companyId,
    scenario
      ? { id: scenario.id, name: scenario.name, source: scenario.source }
      : { id: "base", name: "Base", source: "blank" }
  );
  const providerConfig = await getCompanyProviderConfig(draft.companyId);
  const { tools: mcpTools } = await assembleMcpTools(draft.companyId, draft.createdByUserId);
  const toolsOverride = assembleAllowedTools(draft.allowedTools, mcpTools);
  const ctx: ToolContext = {
    companyId: draft.companyId,
    userId: draft.createdByUserId,
    scenarioId: scenario?.id ?? null,
    auditSource: "scheduled_job",
  };
  const result = await withTimeout(
    chat({
      messages: [{ role: "user", content: draft.prompt }],
      financialContext: contextText,
      mode: "autonomous",
      toolsOverride,
      providerConfig,
      nowContext,
      onToolCall: makeOnToolCall(ctx, { dryRun: false, allowedNames: new Set(draft.allowedTools) }),
    }),
    getSafetyLimits().runTimeoutMs
  );
  return { response: result.response, toolResults: result.toolResults };
}
