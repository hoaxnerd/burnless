"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, Calculator, TrendingUp, Clock, Pencil, Trash2, PieChart } from "lucide-react";
import { CurrencyInput } from "@/components/forms/primitives";
import { AiGate } from "@/components/ai/ai-gate";
import { useOptionalAiFlags } from "@/components/ai/ai-feature-context";
import { FundingRoundForm } from "./funding-round-form";
import { InvestorList } from "./investor-list";
import { MilestoneTracker } from "./milestone-tracker";
import { Modal } from "@/components/ui";
import { dSum, ratioToPct } from "@burnless/engine";
import { formatCurrency, type CurrencyCode } from "@burnless/types";
import { OverrideIndicator } from "@/components/scenarios/override-indicator";
import { HiddenEntitiesSection } from "@/components/scenarios/hidden-entities-section";
import { useScenarioOverrides } from "@/components/scenarios/use-scenario-overrides";
import { useLocale } from "@/components/locale/locale-context";
import { apiFetch } from "@/lib/api-fetch";
import { extractApiError, toUserMessage } from "@/lib/api-error";
import { useToast } from "@/components/ui/toast";

interface GrantMilestone {
  id: string;
  label: string;
  amount: number;
  dueDate: string;
  hitDate?: string;
  matchWarning?: { requiredAmount: number; actualAmount: number; asOf: string };
}

interface FundingRound {
  id: string;
  name: string;
  type: string;
  amount: number;
  date: string;
  preMoneyValuation: number | null;
  dilutionPercent: number | null;
  isProjected: boolean;
  milestones?: GrantMilestone[];
}

const roundTypeLabels: Record<string, string> = {
  pre_seed: "Pre-Seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c_plus: "Series C+",
  debt: "Debt",
  grant: "Grant",
};

const roundTypeColors: Record<string, string> = {
  pre_seed: "bg-violet-100 text-violet-700",
  seed: "bg-brand-100 text-brand-700",
  series_a: "bg-sky-100 text-sky-700",
  series_b: "bg-emerald-100 text-emerald-700",
  series_c_plus: "bg-amber-100 text-amber-700",
  debt: "bg-surface-200 text-surface-600",
  grant: "bg-success-100 text-success-700",
};

const segmentColors = [
  "#3b82f6", // brand
  "#8b5cf6", // violet
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
];

// ── Ownership Donut ─────────────────────────────────────────────────────────

interface OwnershipChartProps {
  foundersOwnership: number;
  completedRounds: FundingRound[];
  /**
   * Whether the reconciled engine cap table actually has share data. When
   * false (no share classes / option pools — the case for every company until
   * a cap-table data-entry path exists), we render a set-up empty state rather
   * than a misleading "Founders 0.0%" donut whose 100% residual is mislabeled
   * "Option Pool". Defaults to true for backward compatibility.
   */
  hasCapTableData?: boolean;
  /**
   * Reconciled cap-table holder rows (engine output — the SAME source
   * /funding/cap-table renders). When present, the donut shows these EXACT
   * segments so the two surfaces never contradict each other. Absent → the
   * legacy founders + per-round-dilution + residual model (kept as fallback).
   */
  capTableRows?: Array<{ holder: string; ownershipPercent: number }>;
}

export function OwnershipChart({ foundersOwnership, completedRounds, hasCapTableData = true, capTableRows }: OwnershipChartProps) {
  const { fmtPercent } = useLocale();
  const capTableSegments = useMemo(() => {
    // Preferred source: the reconciled engine cap table (foots to 100% and
    // matches the /funding/cap-table holder table exactly). ownershipPercent is
    // a 0-1 ratio → ratioToPct for display (never an inline *100).
    if (capTableRows && capTableRows.length > 0) {
      return capTableRows.map((row, i) => ({
        label: row.holder,
        percent: ratioToPct(row.ownershipPercent),
        color: segmentColors[i % segmentColors.length]!,
      }));
    }

    // Fallback (no reconciled rows): founders + per-round dilution + residual.
    const segments: Array<{ label: string; percent: number; color: string }> = [];
    segments.push({ label: "Founders", percent: foundersOwnership, color: segmentColors[0]! });

    completedRounds.forEach((round, i) => {
      const dilution = round.dilutionPercent ?? 0;
      if (dilution > 0) {
        segments.push({
          label: round.name,
          percent: dilution,
          color: segmentColors[(i + 1) % segmentColors.length]!,
        });
      }
    });

    const usedPercent = dSum(segments.map((s) => s.percent));
    if (usedPercent < 100) {
      segments.push({ label: "Option Pool", percent: 100 - usedPercent, color: segmentColors[segments.length % segmentColors.length]! });
    }

    return segments;
  }, [foundersOwnership, completedRounds, capTableRows]);

  // Precompute each arc's start/end angle here (a memo) rather than mutating a
  // running accumulator inside the render JSX — the React Compiler rejects
  // reassigning a captured variable during render. `* 360` is arc geometry
  // (allowlisted by no-inline-financial-calc), not a financial figure.
  const donutArcs = useMemo(() => {
    const angles = capTableSegments.map((s) => (s.percent / 100) * 360);
    return capTableSegments.map((seg, i) => {
      const startAngle = angles.slice(0, i).reduce((a, b) => a + b, 0);
      return { color: seg.color, startAngle, endAngle: startAngle + angles[i]! };
    });
  }, [capTableSegments]);

  const donutSize = 200;
  const donutCenter = donutSize / 2;
  const donutRadius = 75;
  const donutStroke = 28;

  function donutSegmentPath(startAngle: number, endAngle: number) {
    const start = polarToCartesian(donutCenter, donutCenter, donutRadius, endAngle);
    const end = polarToCartesian(donutCenter, donutCenter, donutRadius, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    // Round to sub-pixel precision so the SVG path string is byte-identical on
    // server and client. Raw Math.cos/sin can differ by 1 ULP between the Node
    // SSR pass and the browser, producing a hydration mismatch on the donut
    // (surfaces once a real cap table exists and the donut actually renders).
    const f = (n: number) => n.toFixed(3);
    return `M ${f(start.x)} ${f(start.y)} A ${donutRadius} ${donutRadius} 0 ${largeArc} 0 ${f(end.x)} ${f(end.y)}`;
  }

  function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  if (!hasCapTableData) {
    // No share classes / option pools → the engine cap table is empty and
    // founder ownership derives to 0. Show a set-up affordance instead of a
    // misleading "Founders 0.0%" donut + a fabricated "Option Pool" residual.
    return (
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
        <h2 className="text-base font-semibold text-surface-900 mb-4">Ownership</h2>
        <div className="flex flex-col items-center justify-center text-center py-8 px-4">
          <div className="h-12 w-12 rounded-full bg-surface-100 flex items-center justify-center mb-3">
            <PieChart className="h-6 w-6 text-surface-400" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-surface-700">No cap table yet</p>
          <p className="mt-1 text-xs text-surface-500 max-w-[15rem]">
            Add share classes and equity grants to see founder ownership and
            dilution. Funding rounds alone don&apos;t build a cap table.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
      <h2 className="text-base font-semibold text-surface-900 mb-4">Ownership</h2>

      <div className="flex justify-center mb-6">
        <div className="relative">
          <svg width={donutSize} height={donutSize} aria-hidden="true">
            {donutArcs.map((arc, i) =>
              arc.endAngle - arc.startAngle < 0.5 ? null : (
                <path
                  key={i}
                  d={donutSegmentPath(arc.startAngle, arc.endAngle - 0.5)}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={donutStroke}
                  strokeLinecap="round"
                />
              )
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums text-surface-900">
              {fmtPercent(foundersOwnership, 1)}
            </span>
            <span className="text-[10px] text-surface-400 uppercase tracking-wider">
              Founders
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {capTableSegments.map((seg, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-xs text-surface-600">{seg.label}</span>
            </div>
            <span className="text-xs tabular-nums font-medium text-surface-900">
              {fmtPercent(seg.percent, 1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Funding Rounds ──────────────────────────────────────────────────────────

interface FundingRoundsListProps {
  rounds: FundingRound[];
  foundersOwnership: number;
  calcRaiseAmount: number;
  setCalcRaiseAmount: (v: number) => void;
  calcPreMoney: number;
  setCalcPreMoney: (v: number) => void;
  calcDilution: { dilution: number; postMoney: number; newOwnership: number };
  currency: CurrencyCode;
}

export function FundingRoundsList({
  rounds,
  foundersOwnership,
  calcRaiseAmount,
  setCalcRaiseAmount,
  calcPreMoney,
  setCalcPreMoney,
  calcDilution,
  currency,
}: FundingRoundsListProps) {
  const completedRounds = rounds.filter((r) => !r.isProjected);
  const projectedRounds = rounds.filter((r) => r.isProjected);

  const { fmtDate, fmtPercent } = useLocale();
  const toast = useToast();
  const router = useRouter();
  // Edit modal state
  const [editingRound, setEditingRound] = useState<FundingRound | null>(null);
  // FUND-07: round-detail panel — mounts InvestorList (+ MilestoneTracker for
  // grant rounds). Opened by clicking a round row.
  const [detailRound, setDetailRound] = useState<FundingRound | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const {
    isInScenarioMode,
    overrideMap,
    deletedEntities,
    handleRevert,
    handleRemove,
    handleRestore,
  } = useScenarioOverrides("funding_round");

  async function handleInlineDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }

    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/funding-rounds/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(await extractApiError(res));
      }
      router.refresh();
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  if (rounds.length === 0) {
    return (
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-16 text-center">
        <div className="mx-auto max-w-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 border border-brand-100">
            <DollarSign className="h-7 w-7 text-brand-500" />
          </div>
          <h3 className="text-lg font-semibold text-surface-900 mb-2">No funding rounds yet</h3>
          <p className="text-sm text-surface-500 mb-6 leading-relaxed">
            Track your fundraising history — amounts, valuations, dilution, and investors.
          </p>
          <p className="text-xs text-surface-400">
            Use the &quot;Add Funding Round&quot; button above or the companion to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl bg-surface-0 border border-surface-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-surface-100">
            <h2 className="text-base font-semibold text-surface-900">Funding Rounds</h2>
            <p className="text-xs text-surface-400 mt-0.5">
              {completedRounds.length} closed{projectedRounds.length > 0 ? `, ${projectedRounds.length} projected` : ""}
            </p>
          </div>

          <div className="divide-y divide-surface-100">
            {completedRounds.map((round) => {
              const roundOverride = isInScenarioMode ? overrideMap.get(round.id) : undefined;
              const roundOverrideTag = roundOverride?.action === "modify" ? "modified" as const : roundOverride?.action === "create" ? "created" as const : null;

              return (
                <OverrideIndicator
                  key={round.id}
                  override={roundOverrideTag}
                  entityName={round.name}
                  onRevert={() => handleRevert(round.id)}
                  onRemove={() => handleRemove(round.id)}
                >
                  <div
                    className="group px-6 py-4 hover:bg-surface-50/50 transition-colors cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-label={`View details for ${round.name}`}
                    onClick={() => setDetailRound(round)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailRound(round);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-surface-900">{round.name}</span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${roundTypeColors[round.type] ?? "bg-surface-100 text-surface-600"}`}>
                            {roundTypeLabels[round.type] ?? round.type}
                          </span>
                        </div>
                        <p className="text-xs text-surface-400">
                          {fmtDate(new Date(round.date), { month: "long", year: "numeric" })}
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingRound(round); }}
                            className="rounded-lg p-1.5 text-surface-300 hover:bg-surface-100 hover:text-surface-600 transition-all"
                            aria-label={`Edit ${round.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleInlineDelete(round.id); }}
                            disabled={deletingId === round.id}
                            aria-label={`Delete ${round.name}`}
                            className={`rounded-lg p-1.5 transition-colors disabled:opacity-50 ${
                              confirmDeleteId === round.id
                                ? "text-white bg-danger-600 hover:bg-danger-700"
                                : "text-surface-300 hover:text-danger-600 hover:bg-danger-50"
                            }`}
                            title={
                              confirmDeleteId === round.id
                                ? "Click again to confirm"
                                : roundOverrideTag
                                  ? "Delete (creates a scenario delete override)"
                                  : "Delete funding round"
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold tabular-nums text-surface-900">
                            {formatCurrency(round.amount, currency, undefined, { compact: true })}
                          </p>
                          <div className="flex items-center gap-3 mt-0.5">
                            {round.preMoneyValuation && (
                              <span className="text-[10px] text-surface-400">
                                {formatCurrency(round.preMoneyValuation, currency, undefined, { compact: true })} pre
                              </span>
                            )}
                            {round.dilutionPercent && (
                              <span className="text-[10px] text-surface-400">
                                {fmtPercent(round.dilutionPercent, 1)} dilution
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </OverrideIndicator>
              );
            })}

            {projectedRounds.map((round) => {
              const roundOverride = isInScenarioMode ? overrideMap.get(round.id) : undefined;
              const roundOverrideTag = roundOverride?.action === "modify" ? "modified" as const : roundOverride?.action === "create" ? "created" as const : null;

              return (
                <OverrideIndicator
                  key={round.id}
                  override={roundOverrideTag}
                  entityName={round.name}
                  onRevert={() => handleRevert(round.id)}
                  onRemove={() => handleRemove(round.id)}
                >
                  <div
                    className="group px-6 py-4 bg-surface-50/30 hover:bg-surface-50/60 transition-colors cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-label={`View details for ${round.name}`}
                    onClick={() => setDetailRound(round)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailRound(round);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="h-3 w-3 text-surface-400" />
                          <span className="text-sm font-medium text-surface-500">{round.name}</span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${roundTypeColors[round.type] ?? "bg-surface-100 text-surface-600"} opacity-60`}>
                            {roundTypeLabels[round.type] ?? round.type}
                          </span>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-warning-100 text-warning-700">
                            Projected
                          </span>
                        </div>
                        <p className="text-xs text-surface-400">
                          {fmtDate(new Date(round.date), { month: "long", year: "numeric" })}
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingRound(round); }}
                            className="rounded-lg p-1.5 text-surface-300 hover:bg-surface-100 hover:text-surface-600 transition-all"
                            aria-label={`Edit ${round.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleInlineDelete(round.id); }}
                            disabled={deletingId === round.id}
                            aria-label={`Delete ${round.name}`}
                            className={`rounded-lg p-1.5 transition-colors disabled:opacity-50 ${
                              confirmDeleteId === round.id
                                ? "text-white bg-danger-600 hover:bg-danger-700"
                                : "text-surface-300 hover:text-danger-600 hover:bg-danger-50"
                            }`}
                            title={
                              confirmDeleteId === round.id
                                ? "Click again to confirm"
                                : roundOverrideTag
                                  ? "Delete (creates a scenario delete override)"
                                  : "Delete funding round"
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium tabular-nums text-surface-500 italic">
                            {formatCurrency(round.amount, currency, undefined, { compact: true })}
                          </p>
                          {round.dilutionPercent && (
                            <span className="text-[10px] text-surface-400 italic">
                              ~{fmtPercent(round.dilutionPercent, 1)} dilution
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </OverrideIndicator>
              );
            })}
          </div>
        </div>

      {/* Hidden in scenario section */}
      {isInScenarioMode && (
        <HiddenEntitiesSection
          deletedEntities={deletedEntities}
          entityLabel="funding round"
          onRestore={handleRestore}
        />
      )}

      {/* FUND-07: round-detail panel — investors for every round, and the
          milestone tracker for grant rounds. roundType stays read-only here
          (immutability contract). Milestones disburse per user-marked hitDate
          regardless of the match-shortfall warning (Phase 2 D §D5 — the warning
          is surfaced as data only, never gating). */}
      {detailRound && (
        <Modal
          open={!!detailRound}
          onClose={() => setDetailRound(null)}
          title={detailRound.name}
        >
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${roundTypeColors[detailRound.type] ?? "bg-surface-100 text-surface-600"}`}>
                {roundTypeLabels[detailRound.type] ?? detailRound.type}
              </span>
              <span className="text-sm font-semibold tabular-nums text-surface-900">
                {formatCurrency(detailRound.amount, currency, undefined, { compact: true })}
              </span>
            </div>

            {detailRound.type === "grant" && (detailRound.milestones?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-surface-900">Milestones</div>
                <MilestoneTracker
                  roundId={detailRound.id}
                  milestones={detailRound.milestones ?? []}
                  onUpdate={() => router.refresh()}
                />
              </div>
            )}

            <InvestorList roundId={detailRound.id} />
          </div>
        </Modal>
      )}

      {/* Edit funding round modal */}
      {editingRound && (
        <Modal
          open={!!editingRound}
          onClose={() => setEditingRound(null)}
          title={`Edit: ${editingRound.name}`}
        >
          <FundingRoundForm
            mode="edit"
            initial={{
              id: editingRound.id,
              name: editingRound.name,
              roundType: editingRound.type as any,
              amount: editingRound.amount,
              date: editingRound.date.includes("T")
                ? editingRound.date.split("T")[0]!
                : editingRound.date,
              closeDate: null,
              notes: null,
              isProjected: editingRound.isProjected,
            }}
            onSubmit={async (payload) => {
              const res = await apiFetch(`/api/funding-rounds/${editingRound.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              if (!res.ok) throw new Error(await extractApiError(res));
              // FUND-06: funding-details is RSC-backed (rounds come from a server
              // prop), so refresh the route after a successful save to pull the
              // edited values into the card. Cancel/close must NOT hit the server.
              router.refresh();
            }}
            onClose={() => setEditingRound(null)}
          />
        </Modal>
      )}
    </>
  );
}

/** Interactive dilution calculator */
export function DilutionCalculator({
  foundersOwnership,
  calcRaiseAmount,
  setCalcRaiseAmount,
  calcPreMoney,
  setCalcPreMoney,
  calcDilution,
  currency,
}: {
  foundersOwnership: number;
  calcRaiseAmount: number;
  setCalcRaiseAmount: (v: number) => void;
  calcPreMoney: number;
  setCalcPreMoney: (v: number) => void;
  calcDilution: { dilution: number; postMoney: number; newOwnership: number };
  currency: CurrencyCode;
}) {
  const { fmtPercent } = useLocale();
  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 overflow-hidden">
      <div className="px-6 py-5 border-b border-surface-100">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-surface-400" />
          <h2 className="text-base font-semibold text-surface-900">Dilution Calculator</h2>
        </div>
        <p className="text-xs text-surface-400 mt-0.5">
          Model how a new raise affects ownership
        </p>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          <div>
            <CurrencyInput
              label="Raise Amount"
              value={calcRaiseAmount}
              onChange={setCalcRaiseAmount}
              min={0}
              step={100000}
            />
            <input
              type="range"
              min="0"
              max="20000000"
              step="250000"
              value={calcRaiseAmount}
              onChange={(e) => setCalcRaiseAmount(Number(e.target.value))}
              className="w-full mt-2 accent-brand-500"
            />
          </div>

          <div>
            <CurrencyInput
              label="Pre-Money Valuation"
              value={calcPreMoney}
              onChange={setCalcPreMoney}
              min={0}
              step={500000}
            />
            <input
              type="range"
              min="0"
              max="100000000"
              step="500000"
              value={calcPreMoney}
              onChange={(e) => setCalcPreMoney(Number(e.target.value))}
              className="w-full mt-2 accent-brand-500"
            />
          </div>
        </div>

        {/* Results */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl bg-surface-50 border border-surface-100 p-4 text-center">
            <p className="text-[10px] font-medium text-surface-400 uppercase tracking-wider mb-1">
              Dilution
            </p>
            <p className="text-xl font-bold tabular-nums text-danger-600">
              {fmtPercent(calcDilution.dilution, 1)}
            </p>
          </div>
          <div className="rounded-xl bg-surface-50 border border-surface-100 p-4 text-center">
            <p className="text-[10px] font-medium text-surface-400 uppercase tracking-wider mb-1">
              Post-Money
            </p>
            <p className="text-xl font-bold tabular-nums text-surface-900">
              {formatCurrency(calcDilution.postMoney, currency, undefined, { compact: true })}
            </p>
          </div>
          <div className="rounded-xl bg-surface-50 border border-surface-100 p-4 text-center">
            <p className="text-[10px] font-medium text-surface-400 uppercase tracking-wider mb-1">
              New Founder %
            </p>
            <p className="text-xl font-bold tabular-nums text-brand-600">
              {fmtPercent(calcDilution.newOwnership, 1)}
            </p>
            <p className="text-[10px] text-surface-400 mt-0.5">
              was {fmtPercent(foundersOwnership, 1)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** AI Fundraising Insight banner. Hidden when AI is off — will be replaced by AI-generated insights. */
export function FundraisingReadinessTip({
  currentRunway,
  currentBurn,
  currency,
}: {
  currentRunway: number;
  currentBurn: number;
  currency: CurrencyCode;
}) {
  const aiFlags = useOptionalAiFlags();
  const name = aiFlags?.companionName ?? "companion";
  return (
    <AiGate feature="insights" hideWhenOff>
    <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-brand-50/30 p-5">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center">
          <TrendingUp className="h-4 w-4 text-brand-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-surface-900">Fundraising Readiness</p>
          <p className="text-xs text-surface-600 mt-1 leading-relaxed">
            With <span className="font-semibold">{Math.round(currentRunway)} months</span> of runway at{" "}
            <span className="font-semibold tabular-nums">{formatCurrency(currentBurn, currency, undefined, { compact: true })}/mo</span> burn,
            {currentRunway <= 6
              ? " you should be actively fundraising now. Most rounds take 3-6 months."
              : currentRunway <= 12
              ? " consider starting fundraising conversations in the next few months."
              : " you have time to focus on growth before your next raise."}
            {" "}Ask the {name} for a detailed fundraising readiness assessment.
          </p>
        </div>
      </div>
    </div>
    </AiGate>
  );
}
