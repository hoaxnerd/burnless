import { Suspense } from "react";
import Link from "next/link";
import {
  getCompany,
  getActiveScenario,
  getScenarios,
  getAccounts,
  getRevenueStreams,
  getFundingRounds,
  getDashboardPreferences,
} from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { seriesToArray, monthKey } from "@burnless/engine";
import { HeroKpiCard } from "./hero-kpi-card";
import { DashboardCharts } from "./dashboard-charts";
import { AiInsightBanner } from "./ai-insight-banner";
import { QuickActions } from "./quick-actions";
import { PinnedInsights } from "./pinned-insights";
import { DashboardEmptyState } from "./empty-state";
import { WeeklyDigestBanner } from "./weekly-digest-banner";
import { BoardMeetingMode } from "./board-meeting-mode";
import { DashboardIntelligenceProvider } from "./dashboard-intelligence-context";
import { DashboardHeader } from "./dashboard-header";
import { CustomizableMetrics } from "./customizable-metrics";
import { StatsCatalog } from "./stats-catalog";
import { FormulaViewer } from "./formula-viewer";

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

function pctChange(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

/** Extract last N values from a MetricValue array for sparklines */
function sparkline(data: Array<{ month: string; value: number }>, n = 8): number[] {
  return data.slice(-n).map((d) => d.value);
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ scenarioId?: string }>;
}) {
  const params = await searchParams;
  const company = await getCompany();
  if (!company) return <SetupPrompt />;

  const scenario = await getActiveScenario(company.id, params.scenarioId);
  if (!scenario) return <NoScenarioPrompt />;

  const [data, allScenarios, accounts, revenueStreams, fundingRounds, dashPrefs] =
    await Promise.all([
      computeDashboardData(company.id, scenario.id),
      getScenarios(company.id),
      getAccounts(company.id),
      getRevenueStreams(scenario.id),
      getFundingRounds(company.id),
      getDashboardPreferences().catch(() => null),
    ]);

  const { metrics, hasData, currentMonth } = data;

  /* ── Current values ─────────────────────────────────────────────── */
  const currentCash = metrics.cashPosition.find((m) => m.month === currentMonth)?.value ?? data.startingCash;
  const currentBurn = metrics.netBurnRate.find((m) => m.month === currentMonth)?.value ?? 0;
  const currentRunway = metrics.cashRunwayMonths.find((m) => m.month === currentMonth)?.value ?? 0;
  const currentMrr = metrics.mrr.find((m) => m.month === currentMonth)?.value ?? 0;

  /* ── Previous month values (for MoM change) ────────────────────── */
  const now = new Date();
  const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevCash = metrics.cashPosition.find((m) => m.month === prevMonth)?.value ?? data.startingCash;
  const prevBurn = metrics.netBurnRate.find((m) => m.month === prevMonth)?.value ?? 0;
  const prevMrr = metrics.mrr.find((m) => m.month === prevMonth)?.value ?? 0;

  /* ── Chart data ─────────────────────────────────────────────────── */
  const revenueArr = seriesToArray(data.totalRevenue);
  const expensesArr = seriesToArray(data.totalExpenses);
  const revenueVsExpenses = revenueArr.map((r, i) => ({
    month: r.month,
    revenue: r.value,
    expenses: expensesArr[i]?.value ?? 0,
  }));

  /* ── Headcount for secondary metrics ────────────────────────────── */
  const currentHeadcount = Math.round(data.headcountSeries.get(currentMonth) ?? 0);
  const prevHeadcount = Math.round(data.headcountSeries.get(prevMonth) ?? 0);

  /* ── Context flags for empty state & quick actions ──────────────── */
  const hasExpenses = data.totalExpenses.size > 0 && Array.from(data.totalExpenses.values()).some((v) => v > 0);
  const hasRevenue = revenueStreams.length > 0;
  const hasFunding = fundingRounds.length > 0;
  const allPopulated = hasFunding && hasExpenses && hasRevenue;

  /* ── Pinned secondary metrics ───────────────────────────────────── */
  const pinnedScenarios = allScenarios.filter((s) => !s.isDefault).slice(0, 4);

  /* ── Board Meeting Mode data ──────────────────────────────────── */
  const mrrGrowthPct = prevMrr > 0 ? ((currentMrr - prevMrr) / prevMrr) * 100 : 0;
  const monthLabel = new Date(now.getFullYear(), now.getMonth(), 1)
    .toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const boardData = {
    companyName: company.name,
    monthLabel,
    cash: currentCash,
    burn: currentBurn,
    runway: currentRunway,
    mrr: currentMrr,
    mrrGrowth: mrrGrowthPct,
    headcount: currentHeadcount,
    headcountDelta: currentHeadcount - prevHeadcount,
  };

  return (
    <DashboardIntelligenceProvider
      initialPreferences={dashPrefs ? {
        mode: (dashPrefs.mode as "intelligence" | "dynamic" | "custom") ?? "dynamic",
        heroCards: (dashPrefs.heroCards as string[]) ?? [],
        secondaryMetrics: (dashPrefs.secondaryMetrics as string[]) ?? [],
        cardModeOverrides: (dashPrefs.cardModeOverrides as Record<string, "intelligence" | "dynamic" | "custom">) ?? {},
        cardScenarioOverrides: (dashPrefs.cardScenarioOverrides as Record<string, string>) ?? {},
        customMetrics: (dashPrefs.customMetrics as Array<{ id: string; name: string; formula: string; dependsOn: string[] }>) ?? [],
      } : null}
    >
      <div>
        {/* Monday Morning CFO Digest */}
        {hasData && <WeeklyDigestBanner />}

        {/* AI Insight Banner */}
        {hasData && (
          <Suspense fallback={<div className="h-16 rounded-2xl bg-surface-50 animate-pulse mb-4" />}>
            <AiInsightBanner
              runway={currentRunway}
              burnRate={currentBurn}
              mrrGrowth={mrrGrowthPct}
              cash={currentCash}
            />
          </Suspense>
        )}

        {/* Header with Mode Switcher */}
        <DashboardHeader
          companyName={company.name}
          hasData={hasData}
          boardData={boardData}
        />

        {/* Hero KPI Cards — progressively populate as data arrives */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-12">
          <HeroKpiCard
            variant="cash"
            label="Cash Position"
            value={hasFunding ? formatCurrency(currentCash) : "$---"}
            change={hasFunding ? pctChange(currentCash, prevCash) ?? undefined : undefined}
            changeLabel={hasFunding ? "vs last month" : undefined}
            description={!hasFunding ? "Add funding to see cash" : undefined}
            sparkData={hasFunding ? sparkline(metrics.cashPosition) : undefined}
            stagger={0}
            celebrate={allPopulated}
          />
          <HeroKpiCard
            variant="burn"
            label="Monthly Burn"
            value={hasExpenses ? formatCurrency(currentBurn) : "$---"}
            change={hasExpenses ? pctChange(currentBurn, prevBurn) ?? undefined : undefined}
            changeLabel={hasExpenses ? "vs last month" : undefined}
            description={!hasExpenses ? "Add expenses to calculate" : undefined}
            sparkData={hasExpenses ? sparkline(metrics.netBurnRate) : undefined}
            stagger={1}
            celebrate={allPopulated}
          />
          <HeroKpiCard
            variant="runway"
            label="Runway"
            value={
              hasFunding && hasExpenses
                ? currentRunway >= 999
                  ? "\u221e"
                  : `${Math.round(currentRunway)} mo`
                : "-- mo"
            }
            description={hasFunding && hasExpenses ? "At current burn rate" : "Add cash & expenses"}
            sparkData={
              hasFunding && hasExpenses
                ? sparkline(
                    metrics.cashRunwayMonths.map((m) => ({
                      ...m,
                      value: Math.min(m.value, 100),
                    }))
                  )
                : undefined
            }
            stagger={2}
            celebrate={allPopulated}
          />
          <HeroKpiCard
            variant="revenue"
            label="MRR"
            value={hasRevenue ? formatCurrency(currentMrr) : "$---"}
            change={hasRevenue && prevMrr > 0 ? pctChange(currentMrr, prevMrr) ?? undefined : undefined}
            changeLabel={hasRevenue && prevMrr > 0 ? "MoM growth" : undefined}
            description={!hasRevenue ? "Add revenue streams" : undefined}
            sparkData={hasRevenue ? sparkline(metrics.mrr) : undefined}
            stagger={3}
            celebrate={allPopulated}
          />
        </div>

        {!hasData ? (
          <DashboardEmptyState
            companyName={company.name}
            hasExpenses={hasExpenses}
            hasRevenue={hasRevenue}
            hasFunding={hasFunding}
          />
        ) : (
          <>
            {/* Quick Actions */}
            <QuickActions
              scenarioId={scenario.id}
              accounts={accounts.map((a) => ({ id: a.id, name: a.name, category: a.category }))}
              context={{
                hasRevenue,
                hasMultipleScenarios: allScenarios.length > 1,
                burnRate: currentBurn,
                runway: currentRunway,
              }}
            />

            {/* Charts */}
            <Suspense fallback={
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 animate-pulse">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-2xl bg-surface-0 border border-surface-200 p-6 h-72" />
                ))}
              </div>
            }>
              <DashboardCharts
                revenueVsExpenses={revenueVsExpenses}
                cashData={metrics.cashPosition}
                burnData={metrics.netBurnRate}
                runwayData={metrics.cashRunwayMonths.map((m) => ({
                  ...m,
                  value: Math.min(m.value, 100),
                }))}
                mrrData={metrics.mrr}
                hasSaaS={metrics.mrr.some((m) => m.value > 0)}
              />
            </Suspense>

            {/* Pinned AI Insights */}
            <Suspense fallback={<div className="mt-6 sm:mt-8 h-24 rounded-2xl bg-surface-50 animate-pulse" />}>
              <div className="mt-6 sm:mt-8">
                <PinnedInsights />
              </div>
            </Suspense>

            {/* Bottom section: Scenarios + Customizable Key Metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mt-6 sm:mt-8">
              {/* Pinned Scenarios */}
              {pinnedScenarios.length > 0 && (
                <div className="rounded-2xl bg-surface-0 border border-surface-200 p-5 sm:p-6 animate-slide-up stagger-5 hover-lift">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-surface-900">Scenarios</h2>
                    <Link
                      href="/scenarios"
                      className="text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors"
                    >
                      View all
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {pinnedScenarios.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-surface-50 transition-colors -mx-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-surface-900">{s.name}</p>
                          <span className="text-xs text-surface-400 capitalize">{s.type}</span>
                        </div>
                        <Link
                          href="/scenarios"
                          className="text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors"
                        >
                          View
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Customizable Key Metrics */}
              <CustomizableMetrics
                metrics={metrics}
                currentMonth={currentMonth}
                prevMonth={prevMonth}
                headcount={{ current: currentHeadcount, previous: prevHeadcount }}
              />
            </div>
          </>
        )}

        {/* Stats Catalog Slide-over */}
        <StatsCatalog />

        {/* Formula Dependency Viewer */}
        <FormulaViewer />
      </div>
    </DashboardIntelligenceProvider>
  );
}

/* ── Supporting Components ────────────────────────────────────────────────── */

function SetupPrompt() {
  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 p-12 text-center animate-scale-in">
      <div className="inline-flex items-center justify-center rounded-2xl bg-brand-500/10 p-4 mb-5">
        <svg className="h-8 w-8 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-surface-900 mb-2">Welcome to Burnless</h3>
      <p className="text-sm text-surface-500 mb-8 max-w-sm mx-auto">
        Your AI-powered financial companion. Complete onboarding to set up your company.
      </p>
      <Link
        href="/onboarding"
        className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shadow-md hover:shadow-lg"
      >
        Get started
      </Link>
    </div>
  );
}

function NoScenarioPrompt() {
  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 p-12 text-center animate-scale-in">
      <div className="inline-flex items-center justify-center rounded-2xl bg-brand-500/10 p-4 mb-5">
        <svg className="h-8 w-8 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-surface-900 mb-2">Create Your First Scenario</h3>
      <p className="text-sm text-surface-500 mb-8 max-w-sm mx-auto">
        A scenario is your financial model. Start with a base case and explore alternatives.
      </p>
      <Link
        href="/scenarios/new"
        className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shadow-md hover:shadow-lg"
      >
        Create scenario
      </Link>
    </div>
  );
}
