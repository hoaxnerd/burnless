import { useState, useCallback, useRef } from "react";

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface ScenarioData {
  id: string;
  name: string;
  type: string;
  description: string | null;
  isDefault: boolean;
  isBudget: boolean;
}

export interface ScenarioBuilderProps {
  scenario: ScenarioData;
  forecastLineCount: number;
  revenueStreamCount: number;
  headcountPlanCount: number;
  totalFunding: number;
}

export interface WhatIfParams {
  monthlyBurn: number;
  monthlyRevenue: number;
  revenueGrowthRate: number;
  headcount: number;
  monthlyHireCost: number;
  cashOnHand: number;
  burnGrowthRate: number;
}

/* ── Constants ──────────────────────────────────────────────────────────── */

export const defaultParams: WhatIfParams = {
  monthlyBurn: 50000,
  monthlyRevenue: 10000,
  revenueGrowthRate: 10,
  headcount: 5,
  monthlyHireCost: 8000,
  cashOnHand: 500000,
  burnGrowthRate: 3,
};

export const paramLabels: Record<keyof WhatIfParams, string> = {
  cashOnHand: "Cash on Hand",
  monthlyBurn: "Monthly Burn",
  burnGrowthRate: "Burn Growth Rate",
  monthlyRevenue: "Monthly Revenue",
  revenueGrowthRate: "Revenue Growth Rate",
  headcount: "Headcount",
  monthlyHireCost: "Avg Cost per Hire",
};

export function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${Math.round(value)}`;
}

export const paramFormats: Record<keyof WhatIfParams, (v: number) => string> = {
  cashOnHand: formatCurrency,
  monthlyBurn: formatCurrency,
  burnGrowthRate: (v) => `${v}%/mo`,
  monthlyRevenue: formatCurrency,
  revenueGrowthRate: (v) => `${v}%/mo`,
  headcount: (v) => `${v} people`,
  monthlyHireCost: formatCurrency,
};

/* ── Undo/Redo Hook ──────────────────────────────────────────────────────── */

export function useUndoRedo<T>(initial: T) {
  const [state, setState] = useState(initial);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const historyRef = useRef<T[]>([initial]);
  const indexRef = useRef(0);

  const updateFlags = useCallback(() => {
    setCanUndo(indexRef.current > 0);
    setCanRedo(indexRef.current < historyRef.current.length - 1);
  }, []);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setState((prev) => {
      const nextVal = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      // Truncate future history
      historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
      historyRef.current.push(nextVal);
      // Cap history at 50 entries
      if (historyRef.current.length > 50) {
        historyRef.current.shift();
      } else {
        indexRef.current++;
      }
      updateFlags();
      return nextVal;
    });
  }, [updateFlags]);

  const undo = useCallback(() => {
    if (indexRef.current > 0) {
      indexRef.current--;
      setState(historyRef.current[indexRef.current]!);
      updateFlags();
    }
  }, [updateFlags]);

  const redo = useCallback(() => {
    if (indexRef.current < historyRef.current.length - 1) {
      indexRef.current++;
      setState(historyRef.current[indexRef.current]!);
      updateFlags();
    }
  }, [updateFlags]);

  return { state, set, undo, redo, canUndo, canRedo };
}

/* ── Projection Logic ──────────────────────────────────────────────────── */

export function projectCashFlow(params: WhatIfParams, months: number) {
  const series: { month: number; label: string; cash: number; revenue: number; burn: number; netBurn: number }[] = [];
  let cash = params.cashOnHand;
  let revenue = params.monthlyRevenue;
  let burn = params.monthlyBurn + params.headcount * params.monthlyHireCost;
  let runwayMonth: number | null = null;

  const now = new Date();
  for (let m = 0; m < months; m++) {
    const date = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const label = date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    const netBurn = burn - revenue;
    series.push({ month: m, label, cash, revenue, burn, netBurn });

    if (cash <= 0 && runwayMonth === null) {
      runwayMonth = m;
    }

    cash -= netBurn;
    revenue *= 1 + params.revenueGrowthRate / 100;
    burn *= 1 + params.burnGrowthRate / 100;
  }

  if (runwayMonth === null && cash > 0) {
    let tempCash = params.cashOnHand;
    let tempRev = params.monthlyRevenue;
    let tempBurn = params.monthlyBurn + params.headcount * params.monthlyHireCost;
    for (let m = 0; m < 120; m++) {
      tempCash -= tempBurn - tempRev;
      if (tempCash <= 0) {
        runwayMonth = m + 1;
        break;
      }
      tempRev *= 1 + params.revenueGrowthRate / 100;
      tempBurn *= 1 + params.burnGrowthRate / 100;
    }
  }

  return { series, runwayMonth };
}
