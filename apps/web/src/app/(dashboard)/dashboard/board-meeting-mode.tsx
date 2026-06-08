"use client";

import { useState, useCallback, useMemo } from "react";
import { Download, Copy, Check, Presentation, X } from "lucide-react";
import { Overlay, IconButton } from "@/components/ui";
import { toUserMessage } from "@/lib/api-error";
import { useToast } from "@/components/ui/toast";
import { usePageShortcuts } from "@/components/ui/keyboard-shortcuts";
import { useLocale } from "@/components/locale/locale-context";

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface BoardMeetingData {
  companyName: string;
  /** e.g. "March 2026" */
  monthLabel: string;
  cash: number;
  burn: number;
  runway: number;
  mrr: number;
  /** MRR MoM growth as a percentage, e.g. 12.3 */
  mrrGrowth: number;
  headcount: number;
  headcountDelta: number;
}

type Signal = "green" | "amber" | "red" | "neutral";

interface MetricDisplay {
  label: string;
  value: string;
  signal: Signal;
  note: string;
}

/* ── Traffic-light logic ────────────────────────────────────────────────────── */

function getRunwaySignal(months: number): { signal: Signal; note: string } {
  if (months >= 999) return { signal: "green", note: "Infinite runway" };
  if (months >= 12) return { signal: "green", note: "Healthy" };
  if (months >= 6) return { signal: "amber", note: "Under 12mo target" };
  return { signal: "red", note: `${months < 3 ? "Critical" : "Low"} — act now` };
}

function getBurnSignal(burn: number, runway: number): { signal: Signal; note: string } {
  if (burn <= 0) return { signal: "green", note: "Net positive" };
  if (runway >= 18) return { signal: "green", note: "Sustainable" };
  if (runway >= 6) return { signal: "amber", note: "Watch" };
  return { signal: "red", note: "High relative to cash" };
}

function getCashSignal(cash: number, runway: number): { signal: Signal; note: string } {
  if (cash <= 0) return { signal: "red", note: "Out of cash" };
  if (runway >= 12) return { signal: "green", note: "Healthy" };
  if (runway >= 6) return { signal: "amber", note: "Monitor" };
  return { signal: "red", note: "Low" };
}

function getGrowthSignal(growthPct: number): { signal: Signal; note: string } {
  if (growthPct >= 10) return { signal: "green", note: "Top quartile" };
  if (growthPct >= 5) return { signal: "green", note: "Solid growth" };
  if (growthPct >= 0) return { signal: "amber", note: "Flat" };
  return { signal: "red", note: "Declining" };
}

function getMrrSignal(mrr: number, growthPct: number): { signal: Signal; note: string } {
  if (mrr <= 0) return { signal: "neutral", note: "No revenue yet" };
  if (growthPct >= 10) return { signal: "green", note: `Growing ${growthPct.toFixed(0)}% MoM` };
  if (growthPct >= 0) return { signal: "amber", note: `+${growthPct.toFixed(0)}% MoM` };
  return { signal: "red", note: `${growthPct.toFixed(0)}% MoM` };
}

function getHeadcountSignal(delta: number): { signal: Signal; note: string } {
  if (delta > 0) return { signal: "neutral", note: `+${delta} this month` };
  if (delta < 0) return { signal: "amber", note: `${delta} this month` };
  return { signal: "neutral", note: "Stable" };
}

/* ── Formatting ─────────────────────────────────────────────────────────────── */

function buildMetrics(data: BoardMeetingData, fmtCompact: (v: number) => string): MetricDisplay[] {
  const cashSig = getCashSignal(data.cash, data.runway);
  const burnSig = getBurnSignal(data.burn, data.runway);
  const runwaySig = getRunwaySignal(data.runway);
  const mrrSig = getMrrSignal(data.mrr, data.mrrGrowth);
  const growthSig = getGrowthSignal(data.mrrGrowth);
  const hcSig = getHeadcountSignal(data.headcountDelta);

  return [
    { label: "Cash", value: fmtCompact(data.cash), ...cashSig },
    { label: "Burn", value: `${fmtCompact(data.burn)}/mo`, ...burnSig },
    {
      label: "Runway",
      value: data.runway >= 999 ? "\u221e" : `${data.runway.toFixed(1)} mo`,
      ...runwaySig,
    },
    { label: "MRR", value: fmtCompact(data.mrr), ...mrrSig },
    {
      label: "Growth",
      value: `${data.mrrGrowth >= 0 ? "+" : ""}${data.mrrGrowth.toFixed(1)}%`,
      ...growthSig,
    },
    { label: "Headcount", value: `${data.headcount}`, ...hcSig },
  ];
}

/* ── Signal dot component ───────────────────────────────────────────────────── */

const signalColors: Record<Signal, string> = {
  green: "bg-success-500",
  amber: "bg-warning-500",
  red: "bg-danger-500",
  neutral: "bg-surface-300",
};

function SignalDot({ signal }: { signal: Signal }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${signalColors[signal]} shrink-0`}
      aria-label={signal}
    />
  );
}

/* ── Clipboard text builder ─────────────────────────────────────────────────── */

function toClipboardText(data: BoardMeetingData, metrics: MetricDisplay[]): string {
  const lines = [
    `${data.companyName} Financial Snapshot`,
    data.monthLabel,
    "",
    ...metrics.map((m) => `${m.label.padEnd(12)} ${m.value.padEnd(12)} ${m.note}`),
    "",
    "Generated by burnless",
  ];
  return lines.join("\n");
}

/* ── PDF generation ─────────────────────────────────────────────────────────── */

async function generateBoardPDF(
  data: BoardMeetingData,
  metrics: MetricDisplay[],
  fmtDate: (date: Date | string, options?: Intl.DateTimeFormatOptions) => string,
) {
  const [{ default: jsPDF }] = await Promise.all([import("jspdf")]);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Brand bar
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 4, "F");

  // Title
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(`${data.companyName}`, 20, 25);

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text(`Financial Snapshot — ${data.monthLabel}`, 20, 33);

  // Metrics
  let y = 50;
  const signalPdfColor: Record<Signal, [number, number, number]> = {
    green: [34, 197, 94],
    amber: [245, 158, 11],
    red: [239, 68, 68],
    neutral: [156, 163, 175],
  };

  for (const metric of metrics) {
    // Signal dot
    const [r, g, b] = signalPdfColor[metric.signal];
    doc.setFillColor(r, g, b);
    doc.circle(25, y - 1.5, 2.5, "F");

    // Label
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(metric.label, 32, y);

    // Value
    doc.setFontSize(13);
    doc.setFont("helvetica", "normal");
    doc.text(metric.value, 80, y);

    // Note
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(metric.note, 120, y);

    y += 14;
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.text("Generated by burnless", 20, 280);
  doc.text(fmtDate(new Date()), pageWidth - 20, 280, { align: "right" });

  doc.save(`${data.companyName.replace(/\s+/g, "-")}-board-snapshot-${data.monthLabel.replace(/\s+/g, "-")}.pdf`);
}

/* ── Board Meeting Mode component ───────────────────────────────────────────── */

export function BoardMeetingButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl bg-surface-0 border border-surface-200 px-4 py-2 text-sm font-medium text-surface-600 hover:bg-surface-50 hover:border-surface-300 transition-all"
      title="Board Meeting Mode (B)"
    >
      <Presentation className="h-4 w-4" />
      <span className="hidden sm:inline">Board Mode</span>
    </button>
  );
}

export function BoardMeetingOverlay({
  data,
  onClose,
}: {
  data: BoardMeetingData;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { fmtCompact, fmtDate } = useLocale();
  const toast = useToast();

  // Safely build metrics with fallback defaults
  const safeData: BoardMeetingData = useMemo(() => ({
    companyName: data?.companyName ?? "Company",
    monthLabel: data?.monthLabel ?? "",
    cash: Number.isFinite(data?.cash) ? data.cash : 0,
    burn: Number.isFinite(data?.burn) ? data.burn : 0,
    runway: Number.isFinite(data?.runway) ? data.runway : 0,
    mrr: Number.isFinite(data?.mrr) ? data.mrr : 0,
    mrrGrowth: Number.isFinite(data?.mrrGrowth) ? data.mrrGrowth : 0,
    headcount: Number.isFinite(data?.headcount) ? data.headcount : 0,
    headcountDelta: Number.isFinite(data?.headcountDelta) ? data.headcountDelta : 0,
  }), [data]);
  const metrics = buildMetrics(safeData, fmtCompact);

  const handleCopy = useCallback(async () => {
    try {
      const text = toClipboardText(safeData, metrics);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Clipboard API may not be available in non-HTTPS contexts
      toast.error(toUserMessage(err));
    }
  }, [safeData, metrics, toast]);

  const handleExportPDF = useCallback(async () => {
    setExporting(true);
    try {
      await generateBoardPDF(safeData, metrics, fmtDate);
    } catch (err) {
      // PDF generation may fail if jspdf can't load — surface the failure
      toast.error(toUserMessage(err));
    } finally {
      setExporting(false);
    }
  }, [safeData, metrics, fmtDate, toast]);

  // <Overlay> owns the portal, scrim, Escape-to-close, focus-trap, scroll-lock
  // and focus-restore (MODAL-SYS-01). Raised to z-[60] so it stacks over other
  // overlays; scrim matches the original blurred backdrop.
  return (
    <Overlay
      open
      onClose={onClose}
      ariaLabel="Board Meeting Mode"
      className="z-[60]"
      // Scrim styling is config passed to the shared <Overlay> primitive (which
      // owns the portal/Escape/focus-trap); raised to z-[60] + blur to sit over
      // other overlays.
      scrimClassName="bg-black/60 fixed inset-0 backdrop-blur-sm z-[60] animate-fade-in"
    >
      {(panelProps) => (
        <div
          {...panelProps}
          className="bg-surface-0 rounded-2xl shadow-2xl border border-surface-200 w-full max-w-lg animate-scale-in outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-surface-100">
            <div>
              <h2 className="text-lg font-bold text-surface-900">{safeData.companyName}</h2>
              <p className="text-sm text-surface-400 mt-0.5">
                Financial Snapshot &mdash; {safeData.monthLabel}
              </p>
            </div>
            <IconButton
              aria-label="Close"
              onClick={onClose}
              size="lg"
              icon={<X />}
            />
          </div>

          {/* Metrics */}
          <div className="px-6 py-5 space-y-1">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="flex items-center justify-between py-3 px-3 -mx-3 rounded-xl hover:bg-surface-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <SignalDot signal={m.signal} />
                  <span className="text-sm font-medium text-surface-700">{m.label}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-surface-400">{m.note}</span>
                  <span className="text-sm font-bold text-surface-900 tabular-nums min-w-[72px] text-right">
                    {m.value}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 px-6 py-4 border-t border-surface-100 bg-surface-50/50 rounded-b-2xl">
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Exporting\u2026" : "Share as PDF"}
            </button>
            <button
              onClick={handleCopy}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-surface-0 border border-surface-200 px-4 py-2.5 text-sm font-semibold text-surface-700 hover:bg-surface-100 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-success-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy to clipboard
                </>
              )}
            </button>
          </div>

          {/* Footer hint */}
          <div className="px-6 py-2.5 border-t border-surface-100">
            <p className="text-[10px] text-surface-300 text-center">
              Press <kbd className="font-mono bg-surface-100 px-1 rounded">Esc</kbd> to close
              &middot; Press <kbd className="font-mono bg-surface-100 px-1 rounded">B</kbd> to
              toggle
            </p>
          </div>
        </div>
      )}
    </Overlay>
  );
}

/* ── Wrapper that manages state + keyboard shortcut ─────────────────────────── */

export function BoardMeetingMode({ data }: { data: BoardMeetingData }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  usePageShortcuts([
    {
      key: "b",
      label: "B",
      description: "Board Meeting Mode",
      action: toggle,
    },
  ]);

  return (
    <>
      <BoardMeetingButton onClick={toggle} />
      {open && <BoardMeetingOverlay data={data} onClose={() => setOpen(false)} />}
    </>
  );
}
