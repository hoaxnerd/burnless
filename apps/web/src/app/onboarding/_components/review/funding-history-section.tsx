import { useState } from "react";
import { DollarSign, Sparkles } from "lucide-react";
import type { FundingRound } from "../types";
import { SectionCard, SuggestionCard } from "./primitives";
import type { SuggestionListApi } from "./use-suggestions";

const ROUND_TYPE_OPTIONS = [
  { value: "pre_seed", label: "Pre-Seed" },
  { value: "seed", label: "Seed" },
  { value: "series_a", label: "Series A" },
  { value: "series_b", label: "Series B" },
  { value: "series_c_plus", label: "Series C+" },
  { value: "debt", label: "Debt" },
  { value: "grant", label: "Grant" },
] as const;

interface Props {
  api: SuggestionListApi<FundingRound>;
  currencySymbol: string;
  fmtCurrency: (value: number, opts?: { decimals?: number }) => string;
}

export function FundingHistorySection({ api, currencySymbol, fmtCurrency }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (api.items.length === 0) return null;

  const toggleExpanded = (id: string | undefined) => {
    if (!id) return;
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <SectionCard icon={DollarSign} title="Suggested Funding History" delay={400}>
      <div className="space-y-4">
        <p className="text-xs text-surface-500 dark:text-surface-400">
          Verify historical funding rounds. Check the round row to include it, and click &quot;Edit&quot; to update amounts or valuations.
        </p>
        <div className="space-y-3">
          {api.items.map((round) => {
            const isExpanded = round.id ? Boolean(expanded[round.id]) : false;
            return (
              <SuggestionCard
                key={round.id}
                selected={Boolean(round.selected)}
                onToggleSelected={(next) => api.updateField(round.id, "selected", next)}
                checkboxAlign="center"
              >
                <div
                  className="flex items-center justify-between p-4 cursor-pointer"
                  onClick={() => api.updateField(round.id, "selected", !round.selected)}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(round.selected)}
                      onChange={(e) => {
                        e.stopPropagation();
                        api.updateField(round.id, "selected", e.target.checked);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                    />
                    <div>
                      <h4 className="text-sm font-semibold text-surface-800 dark:text-surface-200">
                        {round.name}
                      </h4>
                      <p className="text-xs text-surface-500 dark:text-surface-400">
                        {round.type.replace("_", " ").toUpperCase()} • {round.date}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-surface-900 dark:text-surface-50">
                      {fmtCurrency(round.amount, { decimals: 0 })}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(round.id);
                      }}
                      className="inline-flex items-center gap-1 rounded bg-surface-100 hover:bg-surface-200 dark:bg-surface-800 dark:hover:bg-surface-700 px-2 py-1 text-xs font-medium text-surface-700 dark:text-surface-300 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                      Edit
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-surface-200 dark:border-surface-700 p-4 grid grid-cols-2 gap-3 bg-surface-50/50 dark:bg-surface-900/50 rounded-b-xl">
                    <ExpandedField label="Round Name" colSpan={2}>
                      <input
                        type="text"
                        value={round.name}
                        onChange={(e) => api.updateField(round.id, "name", e.target.value)}
                        className="w-full mt-1 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 px-3 py-1.5 text-xs focus:ring-2 focus:ring-brand-500"
                      />
                    </ExpandedField>
                    <ExpandedField label="Round Type">
                      <select
                        value={round.type}
                        onChange={(e) =>
                          api.updateField(round.id, "type", e.target.value as FundingRound["type"])
                        }
                        className="w-full mt-1 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 px-3 py-1.5 text-xs focus:ring-2 focus:ring-brand-500"
                      >
                        {ROUND_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </ExpandedField>
                    <ExpandedField label="Amount Raised">
                      <PrefixedNumber
                        symbol={currencySymbol}
                        value={round.amount}
                        onChange={(v) => api.updateField(round.id, "amount", v)}
                      />
                    </ExpandedField>
                    <ExpandedField label="Date Raised">
                      <input
                        type="date"
                        value={round.date}
                        onChange={(e) => api.updateField(round.id, "date", e.target.value)}
                        className="w-full mt-1 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 px-3 py-1.5 text-xs focus:ring-2 focus:ring-brand-500"
                      />
                    </ExpandedField>
                    <ExpandedField label="Pre-Money Valuation">
                      <PrefixedNumber
                        symbol={currencySymbol}
                        value={round.preMoneyValuation ?? ""}
                        onChange={(v) => api.updateField(round.id, "preMoneyValuation", v || null)}
                      />
                    </ExpandedField>
                  </div>
                )}
              </SuggestionCard>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

function ExpandedField({
  label,
  colSpan = 1,
  children,
}: {
  label: string;
  colSpan?: 1 | 2;
  children: React.ReactNode;
}) {
  return (
    <div className={colSpan === 2 ? "col-span-2" : ""}>
      <label className="text-xs font-medium text-surface-600 dark:text-surface-400">{label}</label>
      {children}
    </div>
  );
}

function PrefixedNumber({
  symbol,
  value,
  onChange,
}: {
  symbol: string;
  value: number | string;
  onChange: (next: number) => void;
}) {
  return (
    <div className="relative mt-1">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-surface-400">
        {symbol}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 pl-6 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}
