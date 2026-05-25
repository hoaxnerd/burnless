"use client";

import type { CurrencyCode } from "@burnless/types";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatDelta } from "./comparison-types";

export function DeltaBadge({
  value,
  percent,
  isCurrency,
  positiveIsGood,
  currency,
}: {
  value: number;
  percent: number;
  isCurrency: boolean;
  positiveIsGood: boolean;
  currency: CurrencyCode;
}) {
  if (value === 0) {
    return (
      <div className="flex items-center gap-1 text-xs text-surface-400">
        <Minus className="h-3 w-3" />
        No change
      </div>
    );
  }

  const isGood = positiveIsGood ? value > 0 : value < 0;
  const Icon = value > 0 ? TrendingUp : TrendingDown;

  return (
    <div
      className={`flex items-center gap-1 text-xs font-medium ${
        isGood ? "text-green-600" : "text-red-600"
      }`}
    >
      <Icon className="h-3 w-3" />
      <span className="sr-only">{isGood ? "Favorable" : "Unfavorable"}:</span>
      {formatDelta(value, isCurrency, currency)}
      {percent !== 0 && (
        <span className="opacity-70">
          ({percent >= 0 ? "+" : ""}
          {percent.toFixed(1)}%)
        </span>
      )}
    </div>
  );
}
