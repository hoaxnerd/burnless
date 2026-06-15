"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  RotateCcw,
  ListChecks,
  FileText,
  GitBranch,
  BarChart3,
  ShieldCheck,
  Wrench,
  Loader2,
  Check,
  Shield,
  Plus,
  Pencil,
  MessageSquareText,
  Lightbulb,
  Send,
} from "lucide-react";

/* The deep AI companion, in action — a faithful, self-playing render of the real
   agentic worklog (plan → tools → diff-gate → genui result). Lives in a
   fixed-height window that auto-scrolls INTERNALLY as the chat grows, so the
   page itself never jumps. Un-revealed nodes are simply not mounted (zero layout
   space) so the conversation grows from the top; auto-follow engages only while
   the reader is already near the bottom. All numbers are verified + reconcile
   with the dashboard demo. Reduced-motion → renders the whole thread at once. */

type Flags = {
  user: boolean;
  think: boolean;
  plan: boolean;
  planDone: boolean;
  t1: boolean;
  t1Done: boolean;
  t2: boolean;
  t2Done: boolean;
  gate: boolean;
  gateApplied: boolean;
  res: boolean;
  kpi: boolean;
  diff: boolean;
  call: boolean;
  chips: boolean;
};

const NONE: Flags = {
  user: false, think: false, plan: false, planDone: false, t1: false, t1Done: false,
  t2: false, t2Done: false, gate: false, gateApplied: false, res: false, kpi: false,
  diff: false, call: false, chips: false,
};
const ALL: Flags = {
  user: true, think: false, plan: true, planDone: true, t1: true, t1Done: true,
  t2: true, t2Done: true, gate: true, gateApplied: true, res: true, kpi: true,
  diff: true, call: true, chips: true,
};

const SEQUENCE: Array<[number, Partial<Flags>]> = [
  [300, { user: true }],
  [800, { think: true }],
  [1900, { think: false, plan: true }],
  [2700, { planDone: true }],
  [3050, { t1: true }],
  [3850, { t1Done: true }],
  [4100, { t2: true }],
  [4950, { t2Done: true }],
  [5250, { gate: true }],
  [6350, { gateApplied: true }],
  [6800, { res: true }],
  [7250, { kpi: true }],
  [7550, { diff: true }],
  [7900, { call: true }],
  [8250, { chips: true }],
];

const reveal = "animate-slide-up";

export function CompanionWindow() {
  const [f, setF] = useState<Flags>(NONE);
  const [runId, setRunId] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);

  // Timed playback (re-runs on replay). Reduced-motion → reveal everything.
  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setF(ALL);
      return;
    }
    setF(NONE);
    followRef.current = true;
    const timers = SEQUENCE.map(([delay, patch]) =>
      window.setTimeout(() => setF((prev) => ({ ...prev, ...patch })), delay)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [runId]);

  // Only auto-follow while the reader is already near the bottom.
  useEffect(() => {
    const b = bodyRef.current;
    if (!b) return;
    const onScroll = () => {
      followRef.current = b.scrollHeight - b.scrollTop - b.clientHeight < 90;
    };
    b.addEventListener("scroll", onScroll, { passive: true });
    return () => b.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const b = bodyRef.current;
    if (!b || !followRef.current) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    b.scrollTo({ top: b.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [f]);

  return (
    <div className="flex h-[min(76vh,600px)] flex-col overflow-hidden rounded-[22px] border border-surface-200 bg-surface-0 shadow-xl">
      {/* header */}
      <div className="flex flex-none items-center gap-2.5 border-b border-surface-100 px-4 py-3">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent-50 text-accent-600">
          <Sparkles className="h-[18px] w-[18px]" />
        </span>
        <div>
          <div className="text-sm font-bold tracking-tight text-surface-900">burnless Companion</div>
          <div className="flex items-center gap-1 text-[0.66rem] text-success-600">
            <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
            online &middot; sees your full model
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRunId((n) => n + 1)}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-accent-200 bg-accent-50 px-2 py-1 text-[0.66rem] font-medium text-accent-600 transition-colors hover:bg-accent-100"
        >
          <RotateCcw className="h-3 w-3" />
          Replay
        </button>
      </div>

      {/* scrollable body */}
      <div
        ref={bodyRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-4 [overscroll-behavior:contain]"
      >
        {f.user && (
          <div className={`flex justify-end ${reveal}`}>
            <div className="max-w-[82%] rounded-[16px] rounded-br-md bg-brand-600 px-4 py-2.5 text-[0.92rem] leading-relaxed text-white">
              What if we hire 3 engineers next quarter?
            </div>
          </div>
        )}

        {f.think && (
          <div className="inline-flex items-center gap-2 text-[0.82rem] text-surface-400">
            <span>Reading your model</span>
            <span className="inline-flex gap-1">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-400"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </span>
          </div>
        )}

        {/* timeline */}
        <div className="flex flex-col">
          {/* plan node */}
          {f.plan && (
            <TimelineNode icon={<ListChecks className="h-2.5 w-2.5" />} drawRail className={reveal}>
              <div className="rounded-[14px] border border-accent-200 bg-accent-50/60 p-[0.85rem]">
                <div className="mb-2.5 flex items-center gap-2 text-[0.86rem] font-bold text-surface-900">
                  <ListChecks className="h-[15px] w-[15px] text-accent-600" />
                  Plan &middot; Model a 3-engineer hire
                </div>
                <PlanStep n={1} icon={<FileText className="h-[13px] w-[13px] text-accent-500" />}>
                  Pull current burn, runway &amp; cash
                  <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-success-50 px-1 py-0.5 text-[0.6rem] font-semibold text-success-600">
                    <ShieldCheck className="h-2.5 w-2.5" />
                    high
                  </span>
                </PlanStep>
                <PlanStep n={2} icon={<GitBranch className="h-[13px] w-[13px] text-accent-500" />}>
                  Build a scenario: +3 engineers @ $150K
                </PlanStep>
                <PlanStep n={3} icon={<BarChart3 className="h-[13px] w-[13px] text-accent-500" />}>
                  Compute runway impact &amp; recommend
                </PlanStep>
                <div className="mt-2.5 flex justify-end gap-2">
                  <button className="rounded-lg border border-surface-200 px-3 py-1.5 text-[0.78rem] font-semibold text-surface-500">
                    Edit
                  </button>
                  {f.planDone ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-success-50 px-3 py-1.5 text-[0.78rem] font-semibold text-success-700">
                      <Check className="h-3 w-3" strokeWidth={3} />
                      Started
                    </span>
                  ) : (
                    <span className="rounded-lg bg-accent-600 px-3 py-1.5 text-[0.78rem] font-semibold text-white">
                      Proceed
                    </span>
                  )}
                </div>
              </div>
            </TimelineNode>
          )}

          {/* tool nodes */}
          {f.t1 && (
            <ToolNode done={f.t1Done} className={reveal}>
              <span className="font-semibold text-surface-800">Read financials</span>
              <span className="text-[0.73rem] text-surface-400">cash &middot; burn &middot; runway</span>
            </ToolNode>
          )}
          {f.t2 && (
            <ToolNode done={f.t2Done} className={reveal}>
              <span className="font-semibold text-surface-800">Build scenario</span>
              <span className="rounded bg-surface-100 px-1.5 py-0.5 font-mono text-[0.7rem] text-surface-500">
                hire_3_engineers
              </span>
            </ToolNode>
          )}

          {/* diff-gate node */}
          {f.gate && (
            <TimelineNode icon={<Shield className="h-2.5 w-2.5" />} drawRail className={reveal}>
              <div className="rounded-[16px] border border-accent-200 bg-accent-50/60 p-[0.9rem]">
                <div className="mb-2.5 flex items-center gap-2 text-[0.85rem] font-bold text-surface-800">
                  <Shield className="h-[15px] w-[15px] text-accent-600" />
                  Apply this change to a scenario?
                </div>
                <div className="mb-2.5 flex items-center gap-2 rounded-[10px] border border-accent-200 bg-accent-50 px-2.5 py-2 text-[0.76rem] text-surface-700">
                  <GitBranch className="h-3.5 w-3.5 flex-none text-accent-600" />
                  <span>
                    New scenario &middot; <b className="text-surface-900">Hire 3 engineers</b> — baseline
                    untouched
                  </span>
                </div>
                <DiffEntity
                  icon={<Plus className="h-[13px] w-[13px] text-success-600" strokeWidth={2.2} />}
                  action="Create"
                  actionClass="text-success-600"
                  entity="Headcount"
                  rows={[
                    ["Role", "3× Software Engineer"],
                    ["Fully-loaded", "$150,000 / yr each"],
                    ["Start", "Q3 2026"],
                  ]}
                />
                <DiffEntity
                  icon={<Pencil className="h-[13px] w-[13px] text-brand-600" />}
                  action="Update"
                  actionClass="text-brand-600"
                  entity="Forecast · Net burn"
                  rows={[["Net burn / mo", <><span className="text-surface-400 line-through">$42,500</span><span className="mx-1 text-surface-400">→</span>$80,000</>]]}
                />
                {f.gateApplied ? (
                  <div className="flex items-center gap-1.5 text-[0.8rem] font-semibold text-success-700">
                    <Check className="h-[15px] w-[15px]" strokeWidth={2.4} />
                    Applied to &ldquo;Hire 3 engineers&rdquo;
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-lg bg-accent-600 px-3 py-1.5 text-[0.78rem] font-semibold text-white">
                      Apply to scenario
                    </span>
                    <span className="rounded-lg bg-surface-100 px-3 py-1.5 text-[0.78rem] font-semibold text-surface-700">
                      Allow for session
                    </span>
                    <span className="rounded-lg border border-surface-200 px-3 py-1.5 text-[0.78rem] font-semibold text-surface-500">
                      Cancel
                    </span>
                  </div>
                )}
                <div className="mt-2 text-[0.67rem] text-surface-400">
                  Nothing touches your baseline — scenarios are a safe overlay.
                </div>
              </div>
            </TimelineNode>
          )}

          {/* result node */}
          {f.res && (
            <TimelineNode
              icon={<MessageSquareText className="h-2.5 w-2.5" />}
              dotClass="border-accent-300 text-accent-600"
              className={reveal}
            >
              <p className="text-[0.88rem] leading-relaxed text-surface-800">
                Hiring 3 raises burn to <b className="text-surface-900">$80K/mo</b> and pulls runway from{" "}
                <b className="text-surface-900">18.2</b> to{" "}
                <span className="font-mono font-semibold text-danger-600">9.7 months</span> — below your
                12-month floor. The breakdown:
              </p>

              {f.kpi && (
                <div className={`mt-2.5 grid grid-cols-2 gap-2 ${reveal}`}>
                  <GenCard label="New net burn" value="$80.0K" delta="▲ 88%" tone="bad" />
                  <GenCard label="Runway" value="9.7 mo" delta="▼ 8.5 mo" tone="bad" />
                  <GenCard label="Cash-out" value="Apr 2027" delta="8 mo sooner" tone="warn" />
                  <GenCard label="Headcount" value="13" delta="▲ 3" tone="neu" />
                </div>
              )}

              {f.diff && (
                <div className={`mt-2.5 overflow-hidden rounded-[12px] border border-surface-200 ${reveal}`}>
                  <table className="w-full text-[0.74rem]">
                    <thead className="bg-surface-50">
                      <tr className="text-[0.6rem] uppercase tracking-wide text-surface-500">
                        <th className="px-2.5 py-2 text-left font-bold">Metric</th>
                        <th className="px-2.5 py-2 text-right font-bold">Baseline</th>
                        <th className="px-2.5 py-2 text-right font-bold">Hire 3</th>
                        <th className="px-2.5 py-2 text-right font-bold">Δ</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums text-surface-700">
                      <DiffRow label="Net burn" base="$42.5K" v="$80.0K" delta="+$37.5K" tone="bad" />
                      <DiffRow label="Runway" base="18.2 mo" v="9.7 mo" delta="−8.5 mo" tone="bad" />
                      <DiffRow label="Headcount" base="10" v="13" delta="+3" tone="neu" />
                      <DiffRow label="Cash-out" base="Dec 2027" v="Apr 2027" delta="−8 mo" tone="bad" />
                    </tbody>
                  </table>
                </div>
              )}

              {f.call && (
                <div className={`mt-2.5 flex items-start gap-2.5 rounded-[12px] border border-accent-200 bg-accent-50/70 px-3 py-2.5 ${reveal}`}>
                  <Lightbulb className="mt-0.5 h-4 w-4 flex-none text-accent-600" />
                  <div>
                    <div className="text-[0.66rem] font-bold uppercase tracking-wide text-accent-700">
                      Recommendation
                    </div>
                    <p className="mt-0.5 text-[0.79rem] leading-relaxed text-surface-700">
                      Hire <b className="font-mono text-surface-900">2</b> now, defer the 3rd to Q4 — holds
                      runway at <b className="font-mono text-surface-900">11.5 mo</b>, the closest to your
                      12-month target. Want me to set that up?
                    </p>
                  </div>
                </div>
              )}

              {f.chips && (
                <div className={`mt-2.5 flex flex-wrap gap-2 ${reveal}`}>
                  {["Set up “Hire 2, defer 1”", "Show monthly cash curve", "Compare to plan"].map((c) => (
                    <span
                      key={c}
                      className="cursor-pointer rounded-full border border-surface-200 bg-surface-0 px-3 py-1.5 text-[0.74rem] font-medium text-surface-700 transition-colors hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </TimelineNode>
          )}
        </div>
      </div>

      {/* composer */}
      <div className="flex-none border-t border-surface-100 px-4 py-3">
        <div className="flex items-center gap-2.5 rounded-[13px] border border-surface-200 bg-surface-50 py-2 pl-3.5 pr-2">
          <span className="flex-1 text-[0.82rem] text-surface-400">Ask anything about your finances…</span>
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-accent-600 text-white">
            <Send className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function TimelineNode({
  icon,
  children,
  drawRail = false,
  dotClass = "",
  className = "",
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  drawRail?: boolean;
  dotClass?: string;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-[18px_1fr] gap-3 ${className}`}>
      <div className="relative flex justify-center">
        {drawRail && (
          <span aria-hidden className="absolute left-1/2 top-1 h-full w-px -translate-x-1/2 bg-surface-200" />
        )}
        <span
          className={`relative z-10 mt-px flex h-[17px] w-[17px] items-center justify-center rounded-full border-[1.5px] border-surface-200 bg-surface-0 text-surface-400 ${dotClass}`}
        >
          {icon}
        </span>
      </div>
      <div className="min-w-0 pb-3.5">{children}</div>
    </div>
  );
}

function ToolNode({
  done,
  children,
  className = "",
}: {
  done: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-[18px_1fr] gap-3 ${className}`}>
      <div className="relative flex justify-center">
        <span aria-hidden className="absolute left-1/2 top-1 h-full w-px -translate-x-1/2 bg-surface-200" />
        <span
          className={`relative z-10 mt-px flex h-[17px] w-[17px] items-center justify-center rounded-full border-[1.5px] bg-surface-0 ${
            done ? "border-success-500/45 text-success-600" : "border-surface-200 text-surface-400"
          }`}
        >
          <Wrench className="h-2.5 w-2.5" />
        </span>
      </div>
      <div className="min-w-0 pb-2.5">
        <div className="flex items-center gap-2 text-[0.81rem] text-surface-700">
          {done ? (
            <Check className="h-[15px] w-[15px] flex-none text-success-600" strokeWidth={2.4} />
          ) : (
            <Loader2 className="h-[15px] w-[15px] flex-none animate-spin text-accent-500" />
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function PlanStep({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-start gap-2 rounded-[10px] border border-surface-200 bg-surface-0 px-2.5 py-2">
      <span className="mt-0.5 text-[0.7rem] font-semibold tabular-nums text-surface-400">{n}</span>
      <span className="mt-0.5 flex-none">{icon}</span>
      <span className="text-[0.79rem] leading-snug text-surface-700">{children}</span>
    </div>
  );
}

function DiffEntity({
  icon,
  action,
  actionClass,
  entity,
  rows,
}: {
  icon: React.ReactNode;
  action: string;
  actionClass: string;
  entity: string;
  rows: Array<[string, React.ReactNode]>;
}) {
  return (
    <div className="mb-2 rounded-[11px] border border-surface-200 bg-surface-0 px-2.5 py-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-[0.73rem] font-bold">
        {icon}
        <span className={actionClass}>{action}</span>
        <span className="font-semibold text-surface-600">{entity}</span>
      </div>
      {rows.map(([k, v], i) => (
        <div key={i} className="grid grid-cols-[minmax(0,7rem)_1fr] items-baseline gap-2 py-0.5 text-[0.75rem]">
          <span className="text-surface-500">{k}</span>
          <span className="font-mono font-semibold text-surface-800">{v}</span>
        </div>
      ))}
    </div>
  );
}

function GenCard({ label, value, delta, tone }: { label: string; value: string; delta: string; tone: "bad" | "warn" | "neu" }) {
  const toneClass = tone === "bad" ? "text-danger-600" : tone === "warn" ? "text-warning-600" : "text-surface-400";
  return (
    <div className="rounded-[12px] border border-surface-200 bg-surface-0 px-2.5 py-2.5">
      <div className="text-[0.62rem] font-medium uppercase tracking-wide text-surface-500">{label}</div>
      <div className="mt-0.5 text-[1.1rem] font-bold tabular-nums text-surface-900">{value}</div>
      <div className={`mt-0.5 text-[0.64rem] font-semibold ${toneClass}`}>{delta}</div>
    </div>
  );
}

function DiffRow({ label, base, v, delta, tone }: { label: string; base: string; v: string; delta: string; tone: "bad" | "neu" }) {
  return (
    <tr className="border-t border-surface-100">
      <td className="px-2.5 py-2 font-semibold text-surface-800">{label}</td>
      <td className="px-2.5 py-2 text-right">{base}</td>
      <td className="px-2.5 py-2 text-right">{v}</td>
      <td className="px-2.5 py-2 text-right">
        <span className={`font-bold ${tone === "bad" ? "text-danger-600" : "text-surface-500"}`}>{delta}</span>
      </td>
    </tr>
  );
}
