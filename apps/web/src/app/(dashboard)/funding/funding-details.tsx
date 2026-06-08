"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, Calculator, TrendingUp, Clock, Pencil, Trash2 } from "lucide-react";
import { CurrencyInput } from "@/components/forms/primitives";
import { AiGate } from "@/components/ai/ai-gate";
import { useOptionalAiFlags } from "@/components/ai/ai-feature-context";
import { FundingRoundForm } from "./funding-round-form";
import { Modal } from "@/components/ui";
import { dSum } from "@burnless/engine";
import { formatCurrency, type CurrencyCode } from "@burnless/types";
import { OverrideIndicator } from "@/components/scenarios/override-indicator";
import { HiddenEntitiesSection } from "@/components/scenarios/hidden-entities-section";
import { useScenarioOverrides } from "@/components/scenarios/use-scenario-overrides";
import { useLocale } from "@/components/locale/locale-context";
import { apiFetch } from "@/lib/api-fetch";
import { extractApiError, toUserMessage } from "@/lib/api-error";
import { useToast } from "@/components/ui/toast";

interface FundingRound {
  id: string;
  name: string;
  type: string;
  amount: number;
  date: string;
  preMoneyValuation: number | null;
  dilutionPercent: number | null;
  isProjected: boolean;
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
}

export function OwnershipChart({ foundersOwnership, completedRounds }: OwnershipChartProps) {
  const { fmtPercent } = useLocale();
  const capTableSegments = useMemo(() => {
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
      segments.push({ label: "Option Pool", percent: 100 - usedPercent, color: "#d1d5db" });
    }

    return segments;
  }, [foundersOwnership, completedRounds]);

  const donutSize = 200;
  const donutCenter = donutSize / 2;
  const donutRadius = 75;
  const donutStroke = 28;

  function donutSegmentPath(startAngle: number, endAngle: number) {
    const start = polarToCartesian(donutCenter, donutCenter, donutRadius, endAngle);
    const end = polarToCartesian(donutCenter, donutCenter, donutRadius, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${donutRadius} ${donutRadius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  }

  function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
      <h2 className="text-base font-semibold text-surface-900 mb-4">Ownership</h2>

      <div className="flex justify-center mb-6">
        <div className="relative">
          <svg width={donutSize} height={donutSize} aria-hidden="true">
            {(() => {
              let cumAngle = 0;
              return capTableSegments.map((seg, i) => {
                const angle = (seg.percent / 100) * 360;
                if (angle < 0.5) {
                  cumAngle += angle;
                  return null;
                }
                const startAngle = cumAngle;
                cumAngle += angle;
                const endAngle = cumAngle;
                return (
                  <path
                    key={i}
                    d={donutSegmentPath(startAngle, endAngle - 0.5)}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={donutStroke}
                    strokeLinecap="round"
                  />
                );
              });
            })()}
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
                  <div className="group px-6 py-4 hover:bg-surface-50/50 transition-colors">
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
                            onClick={() => setEditingRound(round)}
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
                  <div className="group px-6 py-4 bg-surface-50/30">
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
                            onClick={() => setEditingRound(round)}
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
