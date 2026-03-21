"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  Square,
  Settings2,
  TrendingUp,
  DollarSign,
  Users,
  Clock,
  AlertTriangle,
  Undo2,
  Redo2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Pencil,
  Check,
  Download,
} from "lucide-react";
import { useScenario } from "@/components/scenarios/scenario-context";
import { ChartCard } from "@/components/ui/chart-card";
import { generateRunwaySummaryPDF, downloadPDF } from "@/lib/pdf-export";

interface ScenarioData {
  id: string;
  name: string;
  type: string;
  description: string | null;
  isDefault: boolean;
  isBudget: boolean;
}

interface ScenarioBuilderProps {
  scenario: ScenarioData;
  forecastLineCount: number;
  revenueStreamCount: number;
  headcountPlanCount: number;
  totalFunding: number;
}

interface WhatIfParams {
  monthlyBurn: number;
  monthlyRevenue: number;
  revenueGrowthRate: number;
  headcount: number;
  monthlyHireCost: number;
  cashOnHand: number;
  burnGrowthRate: number;
}

const defaultParams: WhatIfParams = {
  monthlyBurn: 50000,
  monthlyRevenue: 10000,
  revenueGrowthRate: 10,
  headcount: 5,
  monthlyHireCost: 8000,
  cashOnHand: 500000,
  burnGrowthRate: 3,
};

const paramLabels: Record<keyof WhatIfParams, string> = {
  cashOnHand: "Cash on Hand",
  monthlyBurn: "Monthly Burn",
  burnGrowthRate: "Burn Growth Rate",
  monthlyRevenue: "Monthly Revenue",
  revenueGrowthRate: "Revenue Growth Rate",
  headcount: "Headcount",
  monthlyHireCost: "Avg Cost per Hire",
};

const paramFormats: Record<keyof WhatIfParams, (v: number) => string> = {
  cashOnHand: formatCurrency,
  monthlyBurn: formatCurrency,
  burnGrowthRate: (v) => `${v}%/mo`,
  monthlyRevenue: formatCurrency,
  revenueGrowthRate: (v) => `${v}%/mo`,
  headcount: (v) => `${v} people`,
  monthlyHireCost: formatCurrency,
};

/* ── Undo/Redo Hook ──────────────────────────────────────────────────────── */

function useUndoRedo<T>(initial: T) {
  const [state, setState] = useState(initial);
  const historyRef = useRef<T[]>([initial]);
  const indexRef = useRef(0);

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
      return nextVal;
    });
  }, []);

  const undo = useCallback(() => {
    if (indexRef.current > 0) {
      indexRef.current--;
      setState(historyRef.current[indexRef.current]!);
    }
  }, []);

  const redo = useCallback(() => {
    if (indexRef.current < historyRef.current.length - 1) {
      indexRef.current++;
      setState(historyRef.current[indexRef.current]!);
    }
  }, []);

  const canUndo = indexRef.current > 0;
  const canRedo = indexRef.current < historyRef.current.length - 1;

  return { state, set, undo, redo, canUndo, canRedo };
}

/* ── Projection Logic ──────────────────────────────────────────────────── */

function projectCashFlow(params: WhatIfParams, months: number) {
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

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${Math.round(value)}`;
}

/* ── Main Component ──────────────────────────────────────────────────────── */

export function ScenarioBuilder({
  scenario,
  forecastLineCount,
  revenueStreamCount,
  headcountPlanCount,
  totalFunding,
}: ScenarioBuilderProps) {
  const { activeScenarioId, enterScenario, exitScenario } = useScenario();
  const isActive = activeScenarioId === scenario.id;

  const {
    state: params,
    set: setParams,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useUndoRedo<WhatIfParams>({
    ...defaultParams,
    cashOnHand: totalFunding || defaultParams.cashOnHand,
  });

  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  const updateParam = useCallback(
    <K extends keyof WhatIfParams>(key: K, value: WhatIfParams[K]) => {
      setParams((prev) => ({ ...prev, [key]: value }));
    },
    [setParams],
  );

  const resetToDefaults = useCallback(() => {
    setParams({
      ...defaultParams,
      cashOnHand: totalFunding || defaultParams.cashOnHand,
    });
  }, [totalFunding, setParams]);

  // Listen for Cmd+Z / Cmd+Shift+Z
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    },
    [undo, redo],
  );

  // Register keyboard listener
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const projectionMonths = 24;
  const { series, runwayMonth } = useMemo(
    () => projectCashFlow(params, projectionMonths),
    [params],
  );

  const [exporting, setExporting] = useState(false);

  const handleExportPDF = useCallback(async () => {
    setExporting(true);
    try {
      const grossBurn = params.monthlyBurn + params.headcount * params.monthlyHireCost;
      const netBurn = grossBurn - params.monthlyRevenue;
      const now = new Date();
      const cashPosition = Array.from({ length: 12 }, (_, i) => {
        const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        let cash = params.cashOnHand;
        let rev = params.monthlyRevenue;
        let burn = grossBurn;
        for (let m = 0; m < i; m++) {
          cash -= burn - rev;
          rev *= 1 + params.revenueGrowthRate / 100;
          burn *= 1 + params.burnGrowthRate / 100;
        }
        return { month: monthKey, value: Math.round(cash) };
      });

      const doc = await generateRunwaySummaryPDF(
        {
          startingCash: params.cashOnHand,
          netBurnRate: netBurn,
          grossBurnRate: grossBurn,
          runwayMonths: runwayMonth ?? 120,
          cashPosition,
        },
        {
          title: `Runway Summary — ${scenario.name}`,
          companyName: "Burnless",
          scenarioName: scenario.name,
        },
      );
      downloadPDF(doc, `runway-${scenario.name.toLowerCase().replace(/\s+/g, "-")}`);
    } finally {
      setExporting(false);
    }
  }, [params, scenario.name, runwayMonth]);

  const lastMonth = series[series.length - 1];
  const breakEvenMonth = series.findIndex((s) => s.revenue >= s.burn);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/scenarios"
            className="rounded-lg p-2 text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-surface-900 tracking-tight">{scenario.name}</h1>
              <span className="rounded-full bg-surface-100 px-2 py-0.5 text-xs font-medium text-surface-600">
                {scenario.type}
              </span>
              {scenario.isDefault && (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                  Default
                </span>
              )}
              {scenario.isBudget && (
                <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">
                  Budget
                </span>
              )}
            </div>
            {scenario.description && (
              <p className="mt-1 text-sm text-surface-500">{scenario.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Undo/Redo buttons */}
          <div className="flex items-center rounded-xl border border-surface-200 overflow-hidden">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="p-2 text-surface-500 hover:bg-surface-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Undo (Cmd+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <div className="w-px h-5 bg-surface-200" />
            <button
              onClick={redo}
              disabled={!canRedo}
              className="p-2 text-surface-500 hover:bg-surface-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Redo (Cmd+Shift+Z)"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={resetToDefaults}
            className="flex items-center gap-1.5 rounded-xl border border-surface-200 px-3 py-2 text-xs font-medium text-surface-500 hover:bg-surface-50 hover:text-surface-700 transition-colors"
            title="Reset to defaults"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-xl border border-surface-200 px-3 py-2 text-xs font-medium text-surface-500 hover:bg-surface-50 hover:text-surface-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Export as PDF"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Exporting..." : "Export PDF"}
          </button>
          {isActive ? (
            <button
              onClick={exitScenario}
              className="flex items-center gap-1.5 rounded-xl bg-amber-100 px-4 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-200 transition-colors"
            >
              <Square className="h-4 w-4" />
              Exit Sandbox
            </button>
          ) : (
            <button
              onClick={() => enterScenario(scenario.id, scenario.name)}
              className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors shadow-sm shadow-brand-600/20"
            >
              <Play className="h-4 w-4" />
              Enter Sandbox
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={Settings2} label="Forecast Lines" value={String(forecastLineCount)} />
        <StatCard icon={TrendingUp} label="Revenue Streams" value={String(revenueStreamCount)} />
        <StatCard icon={Users} label="Headcount Plans" value={String(headcountPlanCount)} />
        <StatCard icon={DollarSign} label="Total Funding" value={formatCurrency(totalFunding)} />
      </div>

      {/* What-If Builder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sliders Panel */}
        <div className="lg:col-span-1 rounded-2xl bg-surface-0 border border-surface-200 p-6 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Settings2 className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-surface-900">What-If Parameters</h2>
          </div>

          <SliderInput
            label="Cash on Hand"
            value={params.cashOnHand}
            min={0} max={5000000} step={25000}
            format={formatCurrency}
            onChange={(v) => updateParam("cashOnHand", v)}
          />
          <SliderInput
            label="Monthly Burn"
            value={params.monthlyBurn}
            min={0} max={500000} step={5000}
            format={formatCurrency}
            onChange={(v) => updateParam("monthlyBurn", v)}
          />
          <SliderInput
            label="Burn Growth Rate"
            value={params.burnGrowthRate}
            min={0} max={20} step={0.5}
            format={(v) => `${v}%`}
            onChange={(v) => updateParam("burnGrowthRate", v)}
          />
          <SliderInput
            label="Monthly Revenue"
            value={params.monthlyRevenue}
            min={0} max={500000} step={1000}
            format={formatCurrency}
            onChange={(v) => updateParam("monthlyRevenue", v)}
          />
          <SliderInput
            label="Revenue Growth Rate"
            value={params.revenueGrowthRate}
            min={0} max={50} step={1}
            format={(v) => `${v}%/mo`}
            onChange={(v) => updateParam("revenueGrowthRate", v)}
          />
          <SliderInput
            label="Headcount"
            value={params.headcount}
            min={1} max={100} step={1}
            format={(v) => `${v} people`}
            onChange={(v) => updateParam("headcount", v)}
          />
          <SliderInput
            label="Avg Cost per Hire"
            value={params.monthlyHireCost}
            min={3000} max={25000} step={500}
            format={formatCurrency}
            onChange={(v) => updateParam("monthlyHireCost", v)}
          />
        </div>

        {/* Projections */}
        <div className="lg:col-span-2 space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard
              label="Runway"
              value={runwayMonth ? `${runwayMonth}mo` : "120+ mo"}
              color={
                runwayMonth && runwayMonth < 6
                  ? "danger"
                  : runwayMonth && runwayMonth < 12
                    ? "warning"
                    : "success"
              }
              icon={Clock}
            />
            <KpiCard
              label="Monthly Net Burn"
              value={formatCurrency(
                params.monthlyBurn +
                  params.headcount * params.monthlyHireCost -
                  params.monthlyRevenue,
              )}
              color="danger"
              icon={TrendingUp}
            />
            <KpiCard
              label="Break Even"
              value={breakEvenMonth >= 0 ? `Month ${breakEvenMonth + 1}` : "Not in range"}
              color={breakEvenMonth >= 0 ? "success" : "warning"}
              icon={DollarSign}
            />
            <KpiCard
              label="End Cash (24mo)"
              value={formatCurrency(Math.max(lastMonth?.cash ?? 0, 0))}
              color={
                (lastMonth?.cash ?? 0) <= 0
                  ? "danger"
                  : (lastMonth?.cash ?? 0) < params.cashOnHand * 0.2
                    ? "warning"
                    : "success"
              }
              icon={DollarSign}
            />
          </div>

          {/* Runway alert */}
          {runwayMonth && runwayMonth < 12 && (
            <div
              className={`rounded-xl p-4 flex items-center gap-3 ${
                runwayMonth < 6
                  ? "bg-danger-50 border border-danger-200"
                  : "bg-warning-50 border border-warning-200"
              }`}
            >
              <AlertTriangle
                className={`h-5 w-5 flex-shrink-0 ${
                  runwayMonth < 6 ? "text-danger-600" : "text-warning-600"
                }`}
              />
              <div>
                <p
                  className={`text-sm font-medium ${
                    runwayMonth < 6 ? "text-danger-800" : "text-warning-800"
                  }`}
                >
                  {runwayMonth < 6 ? "Critical:" : "Warning:"} Cash runs out in{" "}
                  {runwayMonth} months
                </p>
                <p
                  className={`text-xs mt-0.5 ${
                    runwayMonth < 6 ? "text-danger-600" : "text-warning-600"
                  }`}
                >
                  {runwayMonth < 6
                    ? "Consider immediate cost cuts or fundraising."
                    : "Start planning your next raise or cost optimization."}
                </p>
              </div>
            </div>
          )}

          {/* Cash Position Chart */}
          <ChartCard title="Cash Position" subtitle="24-month projection">
            <RunwayChart series={series} runwayMonth={runwayMonth} />
          </ChartCard>

          {/* Revenue vs Burn Chart */}
          <ChartCard title="Revenue vs Burn" subtitle="Monthly comparison">
            <RevenueBurnChart series={series} />
          </ChartCard>
        </div>
      </div>

      {/* Assumptions Panel */}
      <div className="rounded-2xl bg-surface-0 border border-surface-200 overflow-hidden">
        <button
          onClick={() => setAssumptionsOpen(!assumptionsOpen)}
          className="w-full flex items-center justify-between p-5 hover:bg-surface-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Settings2 className="h-4 w-4 text-surface-500" />
            <div className="text-left">
              <h3 className="text-sm font-semibold text-surface-900">Assumptions</h3>
              <p className="text-xs text-surface-500 mt-0.5">
                {Object.keys(params).length} parameters defining this scenario
              </p>
            </div>
          </div>
          {assumptionsOpen ? (
            <ChevronUp className="h-4 w-4 text-surface-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-surface-400" />
          )}
        </button>

        {assumptionsOpen && (
          <div className="border-t border-surface-200 divide-y divide-surface-100">
            {(Object.keys(paramLabels) as Array<keyof WhatIfParams>).map((key) => (
              <AssumptionRow
                key={key}
                label={paramLabels[key]}
                value={params[key]}
                format={paramFormats[key]}
                onChange={(v) => updateParam(key, v)}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function AssumptionRow({
  label,
  value,
  format,
  onChange,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const startEdit = () => {
    setEditValue(String(value));
    setEditing(true);
  };

  const commitEdit = () => {
    const parsed = Number(editValue);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between px-5 py-3 hover:bg-surface-50 transition-colors group">
      <span className="text-sm text-surface-600">{label}</span>
      <div className="flex items-center gap-2">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
              className="w-24 rounded-lg border border-brand-500 bg-surface-0 px-2 py-1 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <button
              onClick={commitEdit}
              className="rounded-md p-1 text-success-600 hover:bg-success-50 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <span className="text-sm font-semibold text-surface-900 tabular-nums">
              {format(value)}
            </span>
            <button
              onClick={startEdit}
              className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-all"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Settings2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-surface-0 border border-surface-200 p-4 flex items-center gap-3">
      <div className="rounded-lg bg-surface-50 p-2">
        <Icon className="h-4 w-4 text-surface-500" />
      </div>
      <div>
        <p className="text-xs text-surface-500">{label}</p>
        <p className="text-sm font-semibold text-surface-900 tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: string;
  color: "success" | "danger" | "warning";
  icon: typeof Clock;
}) {
  const colorMap = {
    success: "border-l-success-500 bg-success-50/30",
    danger: "border-l-danger-500 bg-danger-50/30",
    warning: "border-l-warning-500 bg-warning-50/30",
  };
  const textColor = {
    success: "text-success-700",
    danger: "text-danger-700",
    warning: "text-warning-700",
  };

  return (
    <div className={`rounded-xl border border-surface-200 border-l-4 ${colorMap[color]} p-4`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`h-3.5 w-3.5 ${textColor[color]}`} />
        <p className="text-xs text-surface-500">{label}</p>
      </div>
      <p className={`text-lg font-bold tabular-nums ${textColor[color]}`}>{value}</p>
    </div>
  );
}

function SliderInput({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-surface-600">{label}</label>
        <span className="text-xs font-semibold text-surface-900 tabular-nums">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-surface-200 rounded-full appearance-none cursor-pointer accent-brand-600
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-600 [&::-webkit-slider-thumb]:border-2
          [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
      />
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-surface-400">{format(min)}</span>
        <span className="text-[10px] text-surface-400">{format(max)}</span>
      </div>
    </div>
  );
}

/** SVG-based runway chart — no heavy deps. */
function RunwayChart({
  series,
  runwayMonth,
}: {
  series: { month: number; label: string; cash: number }[];
  runwayMonth: number | null;
}) {
  const width = 700;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxCash = Math.max(...series.map((s) => s.cash), 0);
  const minCash = Math.min(...series.map((s) => s.cash), 0);
  const range = maxCash - minCash || 1;

  const scaleX = (i: number) => padding.left + (i / (series.length - 1)) * chartW;
  const scaleY = (v: number) => padding.top + (1 - (v - minCash) / range) * chartH;

  const zeroY = scaleY(0);
  const points = series.map((s, i) => `${scaleX(i)},${scaleY(s.cash)}`).join(" ");

  const areaPath = `M${scaleX(0)},${zeroY} ${series.map((s, i) => `L${scaleX(i)},${scaleY(s.cash)}`).join(" ")} L${scaleX(series.length - 1)},${zeroY} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Zero line */}
      {minCash < 0 && (
        <line
          x1={padding.left} y1={zeroY} x2={width - padding.right} y2={zeroY}
          stroke="var(--color-surface-300)" strokeDasharray="4,4" strokeWidth="1"
        />
      )}
      {/* Area fill */}
      <path d={areaPath} fill="url(#cashGradient)" />
      {/* Line */}
      <polyline points={points} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" />
      {/* Runway marker */}
      {runwayMonth !== null && runwayMonth < series.length && (
        <>
          <line
            x1={scaleX(runwayMonth)} y1={padding.top} x2={scaleX(runwayMonth)} y2={height - padding.bottom}
            stroke="#ef4444" strokeDasharray="4,4" strokeWidth="1.5"
          />
          <text
            x={scaleX(runwayMonth)} y={padding.top - 5} textAnchor="middle"
            fill="#ef4444" fontSize="10" fontWeight="600"
          >
            Cash = $0
          </text>
        </>
      )}
      {/* Y-axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const v = minCash + pct * range;
        return (
          <text key={pct} x={padding.left - 6} y={scaleY(v) + 3} textAnchor="end" fill="var(--color-surface-400)" fontSize="9">
            {formatCurrency(v)}
          </text>
        );
      })}
      {/* X-axis labels */}
      {series.filter((_, i) => i % 3 === 0).map((s, idx) => (
        <text key={idx} x={scaleX(s.month)} y={height - 8} textAnchor="middle" fill="var(--color-surface-400)" fontSize="9">
          {s.label}
        </text>
      ))}
    </svg>
  );
}

/** Revenue vs Burn bar chart. */
function RevenueBurnChart({
  series,
}: {
  series: { month: number; label: string; revenue: number; burn: number }[];
}) {
  const width = 700;
  const height = 180;
  const padding = { top: 15, right: 20, bottom: 30, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(...series.map((s) => Math.max(s.revenue, s.burn)));
  const barGroupW = chartW / series.length;
  const barW = barGroupW * 0.35;

  const scaleY = (v: number) => padding.top + (1 - v / (maxVal || 1)) * chartH;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {series.map((s, i) => {
        const x = padding.left + i * barGroupW;
        return (
          <g key={i}>
            <rect
              x={x + barGroupW * 0.1} y={scaleY(s.revenue)}
              width={barW} height={chartH + padding.top - scaleY(s.revenue)}
              rx={2} fill="#3b82f6" opacity={0.8}
            />
            <rect
              x={x + barGroupW * 0.1 + barW + 2} y={scaleY(s.burn)}
              width={barW} height={chartH + padding.top - scaleY(s.burn)}
              rx={2} fill="#ef4444" opacity={0.6}
            />
            {i % 3 === 0 && (
              <text x={x + barGroupW / 2} y={height - 8} textAnchor="middle" fill="var(--color-surface-400)" fontSize="9">
                {s.label}
              </text>
            )}
          </g>
        );
      })}
      {/* Y-axis */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const v = pct * maxVal;
        return (
          <text key={pct} x={padding.left - 6} y={scaleY(v) + 3} textAnchor="end" fill="var(--color-surface-400)" fontSize="9">
            {formatCurrency(v)}
          </text>
        );
      })}
      {/* Inline legend */}
      <circle cx={width - 130} cy={10} r={4} fill="#3b82f6" opacity={0.8} />
      <text x={width - 122} y={14} fill="var(--color-surface-500)" fontSize="9">Revenue</text>
      <circle cx={width - 64} cy={10} r={4} fill="#ef4444" opacity={0.6} />
      <text x={width - 56} y={14} fill="var(--color-surface-500)" fontSize="9">Burn</text>
    </svg>
  );
}
