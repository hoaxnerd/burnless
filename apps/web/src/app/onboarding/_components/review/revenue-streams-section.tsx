import { TrendingUp } from "lucide-react";
import type { RevenueStream } from "../types";
import { SectionCard, SuggestionCard, MiniInput, MiniSelect, CurrencyInput } from "./primitives";
import type { SuggestionListApi } from "./use-suggestions";

const REVENUE_TYPE_OPTIONS = [
  { value: "subscription", label: "Subscription" },
  { value: "one_time", label: "One-time" },
  { value: "usage_based", label: "Usage-based" },
  { value: "services", label: "Services" },
  { value: "marketplace", label: "Marketplace" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "hardware", label: "Hardware" },
] as const;

interface Props {
  api: SuggestionListApi<RevenueStream>;
  currencySymbol: string;
  fmtCurrency: (value: number, opts?: { decimals?: number }) => string;
}

export function RevenueStreamsSection({ api, currencySymbol, fmtCurrency }: Props) {
  if (api.items.length === 0) return null;
  return (
    <SectionCard icon={TrendingUp} title="Suggested Revenue Streams" delay={350}>
      <div className="space-y-4">
        <p className="text-xs text-surface-500 dark:text-surface-400">
          Select which revenue streams to include in your model. Change quantity or price to calculate estimated monthly income.
        </p>
        <div className="space-y-3">
          {api.items.map((stream) => {
            const monthlyVal = stream.amount * stream.quantity;
            return (
              <SuggestionCard
                key={stream.id}
                selected={Boolean(stream.selected)}
                onToggleSelected={(next) => api.updateField(stream.id, "selected", next)}
              >
                <div className="flex flex-col sm:flex-row gap-2">
                  <MiniInput
                    value={stream.name}
                    onChange={(v) => api.updateField(stream.id, "name", v)}
                    placeholder="Stream Name"
                    className="flex-1"
                  />
                  <MiniSelect
                    value={stream.type}
                    onChange={(v) => api.updateField(stream.id, "type", v)}
                    options={REVENUE_TYPE_OPTIONS}
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <FieldRow label="Price/Rate:">
                    <CurrencyInput
                      symbol={currencySymbol}
                      value={stream.amount}
                      onChange={(v) => api.updateField(stream.id, "amount", v)}
                      className="flex-1"
                    />
                  </FieldRow>
                  <FieldRow label="Qty/Vol:">
                    <MiniInput
                      type="number"
                      value={stream.quantity}
                      onChange={(v) => api.updateField(stream.id, "quantity", parseFloat(v) || 0)}
                      className="w-full"
                    />
                  </FieldRow>
                  <FieldRow label="Start:">
                    <MiniInput
                      type="date"
                      value={stream.startDate}
                      onChange={(v) => api.updateField(stream.id, "startDate", v)}
                      className="w-full"
                    />
                  </FieldRow>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-surface-100 dark:border-surface-800/80">
                  <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">
                    Estimated Revenue: {fmtCurrency(monthlyVal, { decimals: 0 })}/mo
                  </span>
                  {stream.notes && (
                    <span
                      className="inline-flex items-center gap-1 rounded bg-surface-100 dark:bg-surface-800 px-2 py-0.5 text-[10px] text-surface-500 max-w-[240px] truncate"
                      title={stream.notes}
                    >
                      💡 {stream.notes}
                    </span>
                  )}
                </div>
              </SuggestionCard>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 flex-1">
      <span className="text-xs text-surface-500 dark:text-surface-400 whitespace-nowrap">{label}</span>
      {children}
    </div>
  );
}
