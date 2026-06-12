"use client";

/* ── GenProposeScheduledJob — chat-first scheduled-job proposal card (S3a Plan 4b §A7)
 *
 * Pixel contract: docs/superpowers/specs/assets/2026-06-12-s3a-job-runtime/
 *   chat-create-proposal-card.html. Mirrors the permission-card / diff-gate tone:
 *   card chrome `rounded-2xl border border-accent-200 bg-accent-50/40`, footer
 *   <Button>s. All color via globals.css token utilities — no raw hex, no inline
 *   style, no one-off CSS.
 *
 * Self-contained: the AI emits this as a DISPLAY block carrying the drafted job +
 * a narrated dry-run preview. The user confirms / edits / cancels here; the buttons
 * call the Plan 4a API routes directly via apiFetch.
 *   - Confirm & schedule → POST /api/automations
 *   - ▶ Run for real now  → POST /api/automations/run-draft (ephemeral commit run)
 *   - Cancel              → dismiss (collapse to a one-line "Cancelled.")
 */

import { useState } from "react";
import { Sparkles, Pencil, ShieldCheck, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import { toUserMessage } from "@/lib/api-error";
import { describeCron } from "@/lib/automations/schedule-presets";
import { ScheduleEditor } from "../../../automations/_components/schedule-editor";

export type ProposeToolPerm = "read" | "write";
export type ProposeToolCategory = "connectors" | "web" | "workspace";

export interface ProposeAllowedTool {
  name: string;
  perm: ProposeToolPerm;
  category: ProposeToolCategory;
  connectorLabel?: string;
}

export interface GenProposeScheduledJobProps {
  name: string;
  prompt: string;
  schedule: string;
  scheduleLabel: string;
  actionKind: "write" | "notify";
  whatItDoes: string;
  dryRunPreview?: string;
  allowedTools: ProposeAllowedTool[];
  boundConnectionIds?: string[];
  /** Forwarded by GenerativeBlock — continue the chat after scheduling. */
  onAction?: (prompt: string) => void;
}

type Status = "idle" | "scheduling" | "scheduled" | "running" | "error";

const CATEGORY_LABEL: Record<ProposeToolCategory, string> = {
  connectors: "Connectors",
  web: "Web",
  workspace: "Workspace",
};

const CATEGORY_ORDER: ProposeToolCategory[] = ["connectors", "web", "workspace"];

/** Section label — uppercase micro-heading (mockup `.lab`). */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-surface-400">
      {children}
    </div>
  );
}

export function GenProposeScheduledJob({
  name,
  prompt,
  schedule,
  scheduleLabel,
  actionKind,
  whatItDoes,
  dryRunPreview,
  allowedTools,
  boundConnectionIds = [],
  onAction,
}: GenProposeScheduledJobProps) {
  const [cron, setCron] = useState(schedule);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [tools, setTools] = useState<ProposeAllowedTool[]>(allowedTools);
  const [status, setStatus] = useState<Status>("idle");
  const [runResult, setRunResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const isWrite = actionKind === "write";

  if (dismissed) {
    return (
      <div className="my-2 ml-9 rounded-xl border border-surface-200 bg-surface-50 px-4 py-2.5 text-xs text-surface-500">
        Cancelled.
      </div>
    );
  }

  // The cron the editor emits may resolve to a known preset; prefer the live
  // describeCron so an edited schedule re-labels itself (falls back to the
  // AI-supplied scheduleLabel when the cron is unchanged).
  const liveLabel = cron === schedule ? scheduleLabel : describeCron(cron);

  function removeTool(toolName: string) {
    setTools((prev) => prev.filter((t) => t.name !== toolName));
  }

  async function handleConfirm() {
    setStatus("scheduling");
    setErrorMsg(null);
    try {
      const res = await apiFetch("/api/automations", {
        method: "POST",
        body: JSON.stringify({
          name,
          prompt,
          actionKind,
          allowedTools: tools.map((t) => t.name),
          boundConnectionIds,
          schedule: cron,
          notifyPolicy: "smart",
        }),
      });
      if (!res.ok) throw new Error("Could not schedule the automation.");
      await res.json().catch(() => null);
      setStatus("scheduled");
      onAction?.(`Scheduled '${name}'. Anything else?`);
    } catch (err) {
      setStatus("error");
      setErrorMsg(toUserMessage(err));
    }
  }

  async function handleRunForReal() {
    setStatus("running");
    setErrorMsg(null);
    setRunResult(null);
    try {
      const res = await apiFetch("/api/automations/run-draft", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          actionKind,
          allowedTools: tools.map((t) => t.name),
          boundConnectionIds,
        }),
      });
      const data = (await res.json().catch(() => null)) as { response?: string; error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "The run failed.");
      setRunResult(data?.response ?? "Run finished.");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMsg(toUserMessage(err));
    }
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    tools: tools.filter((t) => t.category === cat),
  })).filter((g) => g.tools.length > 0);

  return (
    <div className="my-2 ml-9 overflow-hidden rounded-2xl border border-accent-200 bg-accent-50/40 animate-slide-up">
      {/* header */}
      <div className="flex items-center gap-2.5 border-b border-accent-100 px-4 py-3">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-accent-600 text-white">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-surface-900">{name}</div>
          <div className="text-[11px] text-surface-500">Proposed automation</div>
        </div>
        <span
          className={`ml-auto flex-none rounded-md border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${
            isWrite
              ? "border-accent-100 bg-accent-50 text-accent-600"
              : "border-highlight-100 bg-highlight-50 text-highlight-600"
          }`}
        >
          {isWrite ? "writes data" : "notify only"}
        </span>
      </div>

      {/* body */}
      <div className="flex flex-col gap-3.5 px-4 py-3.5">
        {/* schedule (editable) */}
        <div>
          <FieldLabel>Schedule</FieldLabel>
          {editingSchedule ? (
            <div className="rounded-xl border border-surface-200 bg-surface-0 p-3">
              <ScheduleEditor value={cron} onChange={setCron} />
              <button
                type="button"
                onClick={() => setEditingSchedule(false)}
                className="mt-2 text-[11px] font-semibold text-brand-600 hover:text-brand-700"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-surface-200 bg-surface-0 px-3 py-2.5 text-[13px] font-semibold text-surface-900">
              <span>{liveLabel}</span>
              <button
                type="button"
                onClick={() => setEditingSchedule(true)}
                className="flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700"
              >
                <Pencil className="h-3 w-3" /> edit
              </button>
            </div>
          )}
        </div>

        {/* what it does */}
        <div>
          <FieldLabel>What it does</FieldLabel>
          <p className="text-[12.5px] leading-relaxed text-surface-600">{whatItDoes}</p>
        </div>

        {/* dry-run box */}
        {dryRunPreview ? (
          <div>
            <FieldLabel>Test run · just now</FieldLabel>
            <div className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-brand-700">
                ✓ Dry run succeeded
                <span className="rounded border border-brand-200 bg-surface-0 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-brand-600">
                  read-only · nothing written
                </span>
              </div>
              <p className="text-[12.5px] leading-relaxed text-surface-700 tabular-nums">
                {dryRunPreview}
              </p>
            </div>
          </div>
        ) : null}

        {/* frozen allowlist */}
        <div>
          <FieldLabel>Allowed tools · frozen to this job</FieldLabel>
          <div className="flex flex-col gap-2">
            {grouped.map((group) => (
              <div key={group.category} className="flex flex-col gap-1.5">
                <div className="text-[10px] font-bold tracking-wide text-surface-500">
                  {CATEGORY_LABEL[group.category]}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.tools.map((t) => (
                    <span
                      key={t.name}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-surface-50 px-2 py-1 text-[11.5px] font-semibold text-surface-700"
                    >
                      {t.connectorLabel ? (
                        <span className="text-surface-500">{t.connectorLabel} ·</span>
                      ) : null}
                      {t.name}
                      <span
                        className={`rounded px-1.5 py-px text-[8.5px] font-extrabold uppercase tracking-wide ${
                          t.perm === "read"
                            ? "bg-success-50 text-success-600"
                            : "bg-accent-50 text-accent-600"
                        }`}
                      >
                        {t.perm}
                      </span>
                      <button
                        type="button"
                        aria-label={"Remove " + t.name}
                        onClick={() => removeTool(t.name)}
                        className="ml-0.5 font-bold text-surface-400 hover:text-surface-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg border border-dashed border-brand-200 bg-surface-0 px-2.5 py-1 text-[11.5px] font-semibold text-brand-600 opacity-50"
              >
                + add tool
              </button>
            </div>
          </div>
        </div>

        {/* safety callouts */}
        <div className="flex items-start gap-2 rounded-xl bg-surface-50 px-3 py-2.5 text-[11px] leading-relaxed text-surface-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-none text-surface-400" />
          <span>
            Runs unattended using <b>only these tools</b>. There&rsquo;s no live approval at
            run time — you&rsquo;re approving the scope now. Disable or edit anytime; every run
            is logged &amp; notified.
          </span>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-[11px] leading-relaxed text-surface-700">
          <Play className="mt-0.5 h-3.5 w-3.5 flex-none text-brand-600" />
          <span>
            Want to see the <b>real thing</b> before saving? The <b>run-for-real</b> button
            executes it once (writes included) so you can verify the actual result, then
            Confirm or Cancel. (Also available on any saved job.)
          </span>
        </div>

        {/* run-for-real inline result */}
        {runResult ? (
          <div className="rounded-xl border border-success-200 bg-success-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-surface-700">
            {runResult}
          </div>
        ) : null}
        {status === "error" && errorMsg ? (
          <div className="rounded-xl border border-danger-200 bg-danger-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-danger-600">
            {errorMsg}
          </div>
        ) : null}
      </div>

      {/* footer */}
      <div className="flex flex-wrap gap-2 border-t border-accent-100 bg-surface-50 px-4 py-3">
        {status === "scheduled" ? (
          <div className="flex items-center gap-1.5 text-sm font-semibold text-success-600">
            <ShieldCheck className="h-4 w-4" /> Scheduled
          </div>
        ) : (
          <>
            <Button
              size="sm"
              variant="primary"
              state={status === "scheduling" ? "loading" : "idle"}
              onClick={handleConfirm}
            >
              Confirm &amp; schedule
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Play className="h-3.5 w-3.5" />}
              state={status === "running" ? "loading" : "idle"}
              onClick={handleRunForReal}
            >
              Run for real now
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
