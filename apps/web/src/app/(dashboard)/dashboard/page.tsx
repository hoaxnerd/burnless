export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
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
import {
  seriesToArray,
  monthKey,
  DEFAULT_HERO_CARDS,
} from "@burnless/engine";
import { HeroCardGrid } from "./hero-card-grid";
import { HeroCardSlot } from "./hero-card-slot";
import {
  DashboardChartCard,
  AreaChartWidget,
  BarChartWidget,
  MultiLineChart,
  chartColors,
  formatCompactCurrency,
} from "./dashboard-charts";
import { AiCommandCenter } from "./ai-command-center";
import { QuickActions } from "./quick-actions";
import { DashboardEmptyState } from "./empty-state";
import { WeeklyDigestBanner } from "./weekly-digest-banner";
import { DashboardIntelligenceProvider } from "./dashboard-intelligence-context";
import { DashboardHeader } from "./dashboard-header";
import { CustomizableMetrics } from "./customizable-metrics";
import { StatsCatalog } from "./stats-catalog";
import { FormulaViewer } from "./formula-viewer";
import { DashboardGrid } from "./dashboard-grid";
import { buildHeroCards, buildHeroSwapCards } from "./dashboard-hero-data";
import { SetupPrompt, NoScenarioPrompt } from "./dashboard-prompts";
import { ScenariosWidget } from "./scenarios-widget";

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

  /* ── Current values (guard against NaN/Infinity from engine) ───── */
  const safeNum = (v: number | undefined, fallback: number) => {
    const n = v ?? fallback;
    return Number.isFinite(n) ? n : fallback;
  };
  const currentCash = safeNum(metrics.cashPosition.find((m) => m.month === currentMonth)?.value, data.startingCash);
  const currentBurn = safeNum(metrics.netBurnRate.find((m) => m.month === currentMonth)?.value, 0);
  const currentRunway = safeNum(metrics.cashRunwayMonths.find((m) => m.month === currentMonth)?.value, 0);
  const currentMrr = safeNum(metrics.mrr.find((m) => m.month === currentMonth)?.value, 0);

  /* ── Previous month values (for MoM change) ────────────────────── */
  const now = new Date();
  const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const _prevCash = safeNum(metrics.cashPosition.find((m) => m.month === prevMonth)?.value, data.startingCash);
  const _prevBurn = safeNum(metrics.netBurnRate.find((m) => m.month === prevMonth)?.value, 0);
  const prevMrr = safeNum(metrics.mrr.find((m) => m.month === prevMonth)?.value, 0);

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

  /* ── Hero card slugs from preferences (dynamic) ──────────── */
  const heroSlugs: string[] =
    (dashPrefs?.heroCards as string[] | undefined)?.length
      ? (dashPrefs!.heroCards as string[])
      : DEFAULT_HERO_CARDS;

  const slugHasData: Record<string, boolean> = {
    cashPosition: hasFunding,
    netBurnRate: hasExpenses,
    cashRunwayMonths: hasFunding && hasExpenses,
    mrr: hasRevenue,
  };

  const heroCards = buildHeroCards(heroSlugs, metrics, currentMonth, prevMonth, slugHasData);
  const heroSwapCards = buildHeroSwapCards(heroSlugs, heroCards, metrics, currentMonth, prevMonth);

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
        layout: (dashPrefs.layout as Array<{ widgetId: string; x: number; y: number; w: number; h: number; autoH?: boolean }>) ?? [],
        customMetrics: (dashPrefs.customMetrics as Array<{ id: string; name: string; formula: string; dependsOn: string[] }>) ?? [],
        closedWidgets: (dashPrefs.closedWidgets as string[]) ?? [],
      } : null}
    >
      <div>
        {/* Header with Mode Switcher — always above the grid */}
        <DashboardHeader
          companyName={company.name}
          hasData={hasData}
          boardData={boardData}
        />

        {!hasData ? (
          <>
            {/* Hero KPI Cards — ghost state when no data, auto-swap in Dynamic mode */}
            <HeroCardGrid cards={heroCards} swaps={heroSwapCards} allPopulated={false} />
            <DashboardEmptyState
              companyName={company.name}
              hasExpenses={hasExpenses}
              hasRevenue={hasRevenue}
              hasFunding={hasFunding}
            />
          </>
        ) : (
          <DashboardGrid
            widgets={{
              /* ── Individual Hero KPI Cards ─────────────────────────── */
              ...Object.fromEntries(
                heroCards.map((card, i) => {
                  const swap = heroSwapCards.find((s) => s.slotIndex === i);
                  return [
                    `hero-${i}`,
                    <HeroCardSlot
                      key={`hero-${i}`}
                      index={i}
                      variant={card.variant}
                      hasData={card.hasData}
                      allPopulated={allPopulated}
                      cardProps={card.props}
                      swapProps={swap ? {
                        originalSlug: swap.originalSlug,
                        originalLabel: swap.originalLabel,
                        restoreHint: swap.restoreHint,
                        variant: swap.variant,
                        cardProps: swap.props,
                      } : null}
                    />,
                  ];
                })
              ),

              /* ── Weekly Digest ─────────────────────────────────────── */
              "weekly-digest": <WeeklyDigestBanner />,

              /* ── AI Command Center ─────────────────────────────────── */
              "ai-command-center": (
                <Suspense fallback={<div className="h-full rounded-2xl bg-surface-50 animate-pulse" />}>
                  <AiCommandCenter
                    runway={currentRunway}
                    burnRate={currentBurn}
                    mrr={currentMrr}
                    mrrGrowth={mrrGrowthPct}
                    cash={currentCash}
                  />
                </Suspense>
              ),

              /* ── Quick Actions ──────────────────────────────────────── */
              "quick-actions": (
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
              ),

              /* ── Individual Charts ──────────────────────────────────── */
              "chart-cash": (
                <DashboardChartCard
                  title="Cash Position"
                  subtitle="Cash balance over time"
                  expandedChildren={<AreaChartWidget data={metrics.cashPosition} color={chartColors.success} height={420} />}
                >
                  <AreaChartWidget data={metrics.cashPosition} color={chartColors.success} />
                </DashboardChartCard>
              ),
              "chart-rev-exp": (
                <DashboardChartCard
                  title="Revenue vs Expenses"
                  subtitle="Monthly comparison"
                  expandedChildren={
                    <BarChartWidget
                      data={revenueVsExpenses}
                      bars={[
                        { dataKey: "revenue", label: "Revenue", color: chartColors.brand },
                        { dataKey: "expenses", label: "Expenses", color: chartColors.danger },
                      ]}
                      height={420}
                    />
                  }
                >
                  <BarChartWidget
                    data={revenueVsExpenses}
                    bars={[
                      { dataKey: "revenue", label: "Revenue", color: chartColors.brand },
                      { dataKey: "expenses", label: "Expenses", color: chartColors.danger },
                    ]}
                  />
                </DashboardChartCard>
              ),
              "chart-burn-runway": (() => {
                const burnRunwayCombined = metrics.netBurnRate.map((b, i) => ({
                  month: b.month,
                  burn: b.value,
                  runway: Math.min(metrics.cashRunwayMonths[i]?.value ?? 0, 100),
                }));
                const lines = [
                  { dataKey: "burn" as const, label: "Net Burn", color: chartColors.danger },
                  { dataKey: "runway" as const, label: "Runway (mo)", color: chartColors.info, dashed: true },
                ];
                return (
                  <DashboardChartCard
                    title="Burn Rate & Runway"
                    subtitle="Net burn and months of runway"
                    expandedChildren={
                      <MultiLineChart data={burnRunwayCombined} lines={lines} formatValue={formatCompactCurrency} height={420} />
                    }
                  >
                    <MultiLineChart data={burnRunwayCombined} lines={lines} formatValue={formatCompactCurrency} />
                  </DashboardChartCard>
                );
              })(),
              "chart-mrr": metrics.mrr.some((m) => m.value > 0) ? (
                <DashboardChartCard
                  title="MRR"
                  subtitle="Monthly recurring revenue"
                  expandedChildren={<AreaChartWidget data={metrics.mrr} color="#7c3aed" height={420} />}
                >
                  <AreaChartWidget data={metrics.mrr} color="#7c3aed" />
                </DashboardChartCard>
              ) : (
                <DashboardChartCard
                  title="Revenue Trend"
                  subtitle="Total monthly revenue"
                  expandedChildren={<AreaChartWidget data={metrics.cashPosition} color={chartColors.brand} height={420} />}
                >
                  <AreaChartWidget data={metrics.cashPosition} color={chartColors.brand} />
                </DashboardChartCard>
              ),

              /* ── Scenarios Panel ────────────────────────────────────── */
              "scenarios": (
                <ScenariosWidget scenarios={pinnedScenarios.map((s) => ({ id: s.id, name: s.name, type: s.type }))} />
              ),

              /* ── Customizable Metrics ───────────────────────────────── */
              "custom-metrics": (
                <CustomizableMetrics
                  metrics={metrics}
                  currentMonth={currentMonth}
                  prevMonth={prevMonth}
                  headcount={{ current: currentHeadcount, previous: prevHeadcount }}
                />
              ),
            }}
          />
        )}

        {/* Stats Catalog Slide-over */}
        <StatsCatalog />

        {/* Formula Dependency Viewer */}
        <FormulaViewer />
      </div>
    </DashboardIntelligenceProvider>
  );
}
