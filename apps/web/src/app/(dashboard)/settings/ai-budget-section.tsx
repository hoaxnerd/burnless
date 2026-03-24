"use client";

import { useState } from "react";
import { DollarSign } from "lucide-react";
import type { BudgetStatus } from "@/components/ai/ai-feature-context";

const BUDGET_PRESETS = [
  { label: "$10/mo", cents: 1000 },
  { label: "$25/mo", cents: 2500 },
  { label: "$50/mo", cents: 5000 },
  { label: "$100/mo", cents: 10000 },
  { label: "$250/mo", cents: 25000 },
];

export function BudgetSection({
  monthlyBudgetCents,
  budget,
  updateFlags,
}: {
  monthlyBudgetCents: number;
  budget: BudgetStatus | null;
  updateFlags: (patch: { monthlyBudgetCents: number }) => void;
}) {
  const [customValue, setCustomValue] = useState("");
  const [showCustom, setShowCustom] = useState(
    !BUDGET_PRESETS.some((p) => p.cents === monthlyBudgetCents)
  );

  const spentDollars = budget ? (budget.spentCents / 100).toFixed(2) : "0.00";
  const budgetDollars = (monthlyBudgetCents / 100).toFixed(2);
  const percentUsed = budget?.percentUsed ?? 0;

  const barColor =
    percentUsed >= 100
      ? "bg-red-500"
      : percentUsed >= 80
        ? "bg-amber-500"
        : "bg-brand-500";

  const statusColor =
    percentUsed >= 100
      ? "text-red-600"
      : percentUsed >= 80
        ? "text-amber-600"
        : "text-surface-500";

  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
      <div className="flex items-center gap-4 mb-5">
        <div className="h-9 w-9 rounded-lg bg-surface-100 flex items-center justify-center">
          <DollarSign className="h-[18px] w-[18px] text-surface-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-surface-900">
            AI Budget
          </h2>
          <p className="text-sm text-surface-500 mt-0.5">
            Set a monthly spending cap to prevent surprise costs
          </p>
        </div>
      </div>

      {/* Usage bar */}
      <div className="mb-5">
        <div className="flex justify-between items-baseline mb-2">
          <span className="text-sm font-medium text-surface-700">
            ${spentDollars} <span className="text-surface-400">of</span> ${budgetDollars}
          </span>
          <span className={`text-xs font-medium ${statusColor}`}>
            {percentUsed >= 100
              ? "Budget exceeded"
              : percentUsed >= 80
                ? "Approaching limit"
                : `${percentUsed.toFixed(1)}% used`}
          </span>
        </div>
        <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(percentUsed, 100)}%` }}
          />
        </div>
        {budget?.exceeded && (
          <p className="text-xs text-red-600 mt-2">
            AI features are paused. Increase your budget or wait until next month.
          </p>
        )}
        {budget?.warning && !budget.exceeded && (
          <p className="text-xs text-amber-600 mt-2">
            You&apos;re approaching your AI budget limit. Consider increasing your cap.
          </p>
        )}
      </div>

      {/* Budget presets */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-surface-700">Monthly cap</p>
        <div className="flex flex-wrap gap-2">
          {BUDGET_PRESETS.map((preset) => (
            <button
              key={preset.cents}
              onClick={() => {
                setShowCustom(false);
                updateFlags({ monthlyBudgetCents: preset.cents });
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                monthlyBudgetCents === preset.cents && !showCustom
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-surface-100 text-surface-700 hover:bg-surface-200"
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={() => {
              setShowCustom(true);
              setCustomValue((monthlyBudgetCents / 100).toString());
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              showCustom
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-surface-100 text-surface-700 hover:bg-surface-200"
            }`}
          >
            Custom
          </button>
        </div>

        {showCustom && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm text-surface-500">$</span>
            <input
              type="number"
              min="0"
              max="10000"
              step="1"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onBlur={() => {
                const cents = Math.round(parseFloat(customValue || "0") * 100);
                if (cents >= 0 && cents <= 1_000_000) {
                  updateFlags({ monthlyBudgetCents: cents });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const cents = Math.round(parseFloat(customValue || "0") * 100);
                  if (cents >= 0 && cents <= 1_000_000) {
                    updateFlags({ monthlyBudgetCents: cents });
                  }
                }
              }}
              className="w-28 px-3 py-1.5 rounded-lg border border-surface-300 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="50"
            />
            <span className="text-sm text-surface-500">/month</span>
          </div>
        )}
      </div>
    </div>
  );
}
