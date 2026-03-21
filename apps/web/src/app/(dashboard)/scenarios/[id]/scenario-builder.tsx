"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Play, Square, Settings2, TrendingUp, DollarSign,
  Users, Clock, AlertTriangle, Undo2, Redo2, RotateCcw,
  ChevronDown, ChevronUp, Download,
} from "lucide-react";
import { useScenario } from "@/components/scenarios/scenario-context";
import { ChartCard } from "@/components/ui/chart-card";

import {
  type ScenarioBuilderProps, type WhatIfParams,
  defaultParams, paramLabels, paramFormats,
  formatCurrency, useUndoRedo, projectCashFlow,
} from "./scenario-utils";
import { RunwayChart, RevenueBurnChart } from "./scenario-charts";
import { AssumptionRow, StatCard, KpiCard, SliderInput } from "./scenario-components";

export function ScenarioBuilder({
  scenario,
  forecastLineCount,
  revenueStreamCount,
  headcountPlanCount,
  totalFunding,
}: ScenarioBuilderProps) {
  const { activeScenarioId, enterScenario, exitScenario } = useScenario();
  const isActive = activeScenarioId === scenario.id;

  const { state: params, set: setParams, undo, redo, canUndo, canRedo } = useUndoRedo<WhatIfParams>({
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
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "z") {
      e.preventDefault();
      if (e.shiftKey) { redo(); } else { undo(); }
    }
  }, [undo, redo]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const { series, runwayMonth } = useMemo(() => projectCashFlow(params, 24), [params]);
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

      const { generateRunwaySummaryPDF, downloadPDF } = await import("@/lib/pdf-export");
      const doc = await generateRunwaySummaryPDF({
        startingCash: params.cashOnHand, netBurnRate: netBurn,
        grossBurnRate: grossBurn, runwayMonths: runwayMonth ?? 120, cashPosition,
      }, {
        title: `Runway Summary — ${scenario.name}`,
        companyName: "Burnless", scenarioName: scenario.name,
      });
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
