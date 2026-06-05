"use client";

import { useState } from "react";
import { pctChange } from "@burnless/engine";
import type { ComputedMetrics, MetricValue } from "@burnless/engine";
import { AreaChartWidget, chartColors, formatPercent, formatNumber } from "@/components/charts";
import { useLocale } from "@/components/locale/locale-context";

type MetricCategory = "revenue" | "saas" | "cash" | "profitability" | "growth" | "efficiency";

interface MetricDefinition {
  key: keyof ComputedMetrics;
  label: string;
  category: MetricCategory;
  format: "currency" | "percent" | "number" | "months" | "ratio";
  description: string;
}

const metricDefinitions: MetricDefinition[] = [
  // Revenue
  { key: "mrr", label: "MRR", category: "revenue", format: "currency", description: "Monthly Recurring Revenue" },
  { key: "arr", label: "ARR", category: "revenue", format: "currency", description: "Annual Recurring Revenue (MRR x 12)" },
  { key: "totalRevenue", label: "Total Revenue", category: "revenue", format: "currency", description: "All revenue sources combined" },
  { key: "revenueRunRate", label: "Revenue Run Rate", category: "revenue", format: "currency", description: "Annualized monthly revenue" },
  { key: "newMrr", label: "New MRR", category: "revenue", format: "currency", description: "MRR from new customers" },
  { key: "expansionMrr", label: "Expansion MRR", category: "revenue", format: "currency", description: "MRR from upsells and plan upgrades" },
  { key: "churnedMrr", label: "Churned MRR", category: "revenue", format: "currency", description: "MRR lost from cancellations" },
  { key: "netNewMrr", label: "Net New MRR", category: "revenue", format: "currency", description: "New + Expansion - Churned MRR" },

  // SaaS
  { key: "totalCustomers", label: "Total Customers", category: "saas", format: "number", description: "Active paying customers" },
  { key: "newCustomersPerMonth", label: "New Customers", category: "saas", format: "number", description: "New customers acquired" },
  { key: "churnedCustomersPerMonth", label: "Churned Customers", category: "saas", format: "number", description: "Customers lost" },
  { key: "customerChurnRate", label: "Customer Churn Rate", category: "saas", format: "percent", description: "Percentage of customers lost per month" },
  { key: "revenueChurnRate", label: "Revenue Churn Rate", category: "saas", format: "percent", description: "Percentage of MRR lost per month" },
  { key: "arpa", label: "ARPA", category: "saas", format: "currency", description: "Average Revenue Per Account" },
  { key: "ltv", label: "LTV", category: "saas", format: "currency", description: "Customer Lifetime Value" },
  { key: "cac", label: "CAC", category: "saas", format: "currency", description: "Customer Acquisition Cost" },
  { key: "ltvCacRatio", label: "LTV:CAC Ratio", category: "saas", format: "ratio", description: "Lifetime value relative to acquisition cost (target: 3x+)" },
  { key: "cacPaybackMonths", label: "CAC Payback", category: "saas", format: "months", description: "Months to recover customer acquisition cost" },
  { key: "saasQuickRatio", label: "SaaS Quick Ratio", category: "saas", format: "ratio", description: "(New + Expansion MRR) / Churned MRR (target: 4x+)" },
  { key: "magicNumber", label: "Magic Number", category: "saas", format: "ratio", description: "Sales efficiency ratio (target: 0.75+)" },

  // Cash
  { key: "burnRate", label: "Gross Burn Rate", category: "cash", format: "currency", description: "Total monthly expenses" },
  { key: "netBurnRate", label: "Net Burn Rate", category: "cash", format: "currency", description: "Monthly cash consumed (expenses - revenue)" },
  { key: "cashRunwayMonths", label: "Cash Runway", category: "cash", format: "months", description: "Months of cash remaining at current burn" },
  { key: "cashPosition", label: "Cash Position", category: "cash", format: "currency", description: "End-of-month cash balance" },

  // Profitability
  { key: "grossProfit", label: "Gross Profit", category: "profitability", format: "currency", description: "Revenue minus cost of goods sold" },
  { key: "grossMarginPercent", label: "Gross Margin %", category: "profitability", format: "percent", description: "Gross profit as % of revenue" },
  { key: "operatingIncome", label: "Operating Income", category: "profitability", format: "currency", description: "Gross profit minus operating expenses" },
  { key: "netIncome", label: "Net Income", category: "profitability", format: "currency", description: "Bottom line profit/loss" },
  { key: "ebitda", label: "EBITDA", category: "profitability", format: "currency", description: "Earnings before interest, taxes, depreciation & amortization" },

  // Growth
  { key: "revenueGrowthRate", label: "Revenue Growth", category: "growth", format: "percent", description: "Month-over-month revenue growth" },
  { key: "mrrGrowthRate", label: "MRR Growth", category: "growth", format: "percent", description: "Month-over-month MRR growth" },
  { key: "customerGrowthRate", label: "Customer Growth", category: "growth", format: "percent", description: "Month-over-month customer growth" },
  { key: "revenuePerEmployee", label: "Revenue/Employee", category: "growth", format: "currency", description: "Annualized revenue per team member" },

  // Efficiency
  { key: "burnMultiple", label: "Burn Multiple", category: "efficiency", format: "ratio", description: "Net burn / net new ARR (lower is better, target: <2x)" },
  { key: "ruleOf40", label: "Rule of 40", category: "efficiency", format: "number", description: "Revenue growth rate + profit margin (target: 40+)" },
];

const categoryLabels: Record<MetricCategory, string> = {
  revenue: "Revenue",
  saas: "SaaS & Customer",
  cash: "Cash & Burn",
  profitability: "Profitability",
  growth: "Growth",
  efficiency: "Efficiency",
};

const categoryColors: Record<MetricCategory, string> = {
  revenue: chartColors.brand,
  saas: "#7c3aed",
  cash: chartColors.success,
  profitability: chartColors.warning,
  growth: chartColors.info,
  efficiency: "#ec4899",
};

function makeMetricFormatter(
  format: MetricDefinition["format"],
  fmtCurrency: (amount: number, options?: { compact?: boolean }) => string,
): (value: number) => string {
  switch (format) {
    case "currency": return (v) => fmtCurrency(v, { compact: true });
    case "percent": return (v) => formatPercent(v);
    case "months": return (v) => v >= 999 ? "\u221e" : `${Math.round(v)}mo`;
    case "ratio": return (v) => `${v.toFixed(1)}x`;
    case "number": return (v) => formatNumber(v);
  }
}

export function MetricsExplorer({
  metrics,
  currentMonth,
}: {
  metrics: ComputedMetrics;
  currentMonth: string;
}) {
  const [activeCategory, setActiveCategory] = useState<MetricCategory | "all">("all");
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const { fmtCurrency } = useLocale();

  const filteredMetrics = activeCategory === "all"
    ? metricDefinitions
    : metricDefinitions.filter((m) => m.category === activeCategory);

  const categories: (MetricCategory | "all")[] = ["all", "revenue", "saas", "cash", "profitability", "growth", "efficiency"];

  return (
    <div className="space-y-6">
      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeCategory === cat
                ? "bg-brand-600 text-white"
                : "bg-surface-100 text-surface-600 hover:bg-surface-200"
            }`}
          >
            {cat === "all" ? "All Metrics" : categoryLabels[cat]}
          </button>
        ))}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMetrics.map((def) => {
          const data = metrics[def.key] as MetricValue[];
          const currentIdx = data.findIndex((d) => d.month === currentMonth);
          const resolvedIdx = currentIdx >= 0 ? currentIdx : data.length - 1;
          const current = data[resolvedIdx]?.value ?? 0;
          const previous = resolvedIdx > 0 ? data[resolvedIdx - 1]?.value ?? 0 : 0;
          const isExpanded = expandedMetric === def.key;

          return (
            <div
              key={def.key}
              className={`rounded-xl bg-surface-0 border transition-all ${
                isExpanded ? "border-brand-300 shadow-sm col-span-1 md:col-span-2 lg:col-span-3" : "border-surface-200"
              }`}
            >
              <button
                onClick={() => setExpandedMetric(isExpanded ? null : def.key)}
                className="w-full text-left p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: categoryColors[def.category] }}
                      />
                      <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">
                        {categoryLabels[def.category]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-surface-900">{def.label}</p>
                    <p className="text-xs text-surface-400">{def.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-surface-900 tabular-nums">
                      {makeMetricFormatter(def.format, fmtCurrency)(current)}
                    </p>
                    {resolvedIdx > 0 && (
                      <TrendIndicator current={current} previous={previous} />
                    )}
                  </div>
                </div>
              </button>

              {isExpanded && data.length > 0 && (
                <div className="px-4 pb-4">
                  <AreaChartWidget
                    data={data}
                    color={categoryColors[def.category]}
                    height={200}
                    formatValue={makeMetricFormatter(def.format, fmtCurrency)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  const change = pctChange(current, previous) ?? 0;
  const isPositive = change >= 0;

  return (
    <span className={`text-xs font-medium ${isPositive ? "text-green-600" : "text-red-600"}`}>
      {isPositive ? "\u2191" : "\u2193"} {Math.abs(change).toFixed(1)}%
    </span>
  );
}
