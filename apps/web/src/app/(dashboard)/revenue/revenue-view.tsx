"use client";

import { DollarSign, TrendingUp, Users, BarChart3 } from "lucide-react";
import { MetricCard } from "@/components/ui";
import { AreaChartWidget, chartColors } from "@/components/charts";
import { ChartCard } from "@/components/ui";
import { RevenueWaterfallChart } from "./revenue-waterfall-chart";
import { RevenueStreamBreakdown } from "./revenue-stream-breakdown";
import { RevenueInsights } from "./revenue-insights";
import { AiPageInsights } from "@/components/ai/ai-page-insights";
import type { RevenueDetails } from "@/lib/compute-revenue";
import type { MetricValue } from "@burnless/engine";

interface RevenueViewProps {
  revenueDetails: RevenueDetails;
  revenueTimeline: { month: string; value: number }[];
  mrrTimeline: MetricValue[];
  scenarioId: string;
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

export function RevenueView({
  revenueDetails,
  revenueTimeline,
  mrrTimeline,
  scenarioId,
}: RevenueViewProps) {
  const { growthMetrics: g, hasSaaS, streamBreakdown, waterfall, monthlyByStream, streamNames } = revenueDetails;

  return (
    <div className="space-y-6">
      {/* Hero metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
        <div className="stagger-1 animate-slide-up">
          <MetricCard
            label="Monthly Revenue"
            value={`${formatCurrency(g.currentRevenue)}`}
            change={g.revenueGrowthPercent !== 0 ? `${g.revenueGrowthPercent > 0 ? "+" : ""}${g.revenueGrowthPercent.toFixed(1)}%` : undefined}
            description="MoM growth"
            trend={g.revenueGrowthPercent > 1 ? "up" : g.revenueGrowthPercent < -1 ? "down" : "flat"}
            icon={DollarSign}
            variant={g.revenueGrowthPercent > 5 ? "success" : g.revenueGrowthPercent < 0 ? "danger" : "default"}
          />
        </div>

        {hasSaaS ? (
          <>
            <div className="stagger-2 animate-slide-up">
              <MetricCard
                label="MRR"
                value={formatCurrency(g.currentMrr)}
                change={g.mrrGrowthPercent !== 0 ? `${g.mrrGrowthPercent > 0 ? "+" : ""}${g.mrrGrowthPercent.toFixed(1)}%` : undefined}
                description={`ARR: ${formatCurrency(g.arr)}`}
                trend={g.mrrGrowthPercent > 1 ? "up" : g.mrrGrowthPercent < -1 ? "down" : "flat"}
                icon={TrendingUp}
                variant="brand"
              />
            </div>
            <div className="stagger-3 animate-slide-up">
              <MetricCard
                label="Customers"
                value={String(Math.round(g.totalCustomers))}
                description={`ARPA: ${formatCurrency(g.arpa)}/mo`}
                icon={Users}
              />
            </div>
            <div className="stagger-4 animate-slide-up">
              <MetricCard
                label="Churn Rate"
                value={`${g.churnRate.toFixed(1)}%`}
                description={`LTV: ${formatCurrency(g.ltv)}`}
                icon={BarChart3}
                variant={g.churnRate > 5 ? "danger" : g.churnRate > 3 ? "warning" : "success"}
              />
            </div>
          </>
        ) : (
          <>
            <div className="stagger-2 animate-slide-up">
              <MetricCard
                label="Annual Run Rate"
                value={formatCurrency(g.currentRevenue * 12)}
                description="Based on current monthly"
                icon={TrendingUp}
                variant="brand"
              />
            </div>
            <div className="stagger-3 animate-slide-up">
              <MetricCard
                label="Revenue Streams"
                value={String(revenueDetails.streamCount)}
                description="Active sources"
                icon={BarChart3}
              />
            </div>
            <div className="stagger-4 animate-slide-up">
              <MetricCard
                label="Growth"
                value={`${g.revenueGrowthPercent > 0 ? "+" : ""}${g.revenueGrowthPercent.toFixed(1)}%`}
                description={g.doublingTimeMonths ? `Doubles in ${Math.ceil(g.doublingTimeMonths)}mo` : "vs last month"}
                icon={TrendingUp}
                variant={g.revenueGrowthPercent > 5 ? "success" : g.revenueGrowthPercent < 0 ? "danger" : "default"}
              />
            </div>
          </>
        )}
      </div>

      {/* AI-powered proactive insights (LLM-generated, cached daily) */}
      <AiPageInsights
        page="revenue"
        scenarioId={scenarioId}
        pageData={{
          growthMetrics: g,
          streamBreakdown: streamBreakdown.map((s) => ({
            name: s.name,
            type: s.type,
            currentRevenue: s.currentRevenue,
            percentage: s.percentage,
            changePercent: s.changePercent,
          })),
        }}
      />

      {/* Deterministic insights (always available, no LLM) */}
      <div className="animate-fade-in">
        <RevenueInsights
          growthMetrics={g}
          streams={streamBreakdown}
          hasSaaS={hasSaaS}
        />
      </div>

      {/* Revenue trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Revenue Over Time" subtitle="Total monthly revenue trend">
          <AreaChartWidget data={revenueTimeline} color={chartColors.brand} />
        </ChartCard>
        {hasSaaS && (
          <ChartCard title="MRR Trend" subtitle="Monthly recurring revenue">
            <AreaChartWidget data={mrrTimeline} color="#7c3aed" />
          </ChartCard>
        )}
      </div>

      {/* MRR Waterfall (SaaS only) */}
      {hasSaaS && <RevenueWaterfallChart waterfall={waterfall} />}

      {/* Revenue stream breakdown */}
      <RevenueStreamBreakdown
        streams={streamBreakdown}
        monthlyByStream={monthlyByStream}
        streamNames={streamNames}
        totalRevenue={g.currentRevenue}
        scenarioId={scenarioId}
      />
    </div>
  );
}
