export const dynamic = "force-dynamic";
export const revalidate = 0;

import {
  getCompany,
  getActiveScenario,
  getServerScenarioId,
  getRevenueStreams,
  getFundingRounds,
  getDashboardPreferences,
} from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import {
  seriesToArray,
  parseMonthKey,
  DEFAULT_HERO_CARDS,
  pctChange,
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
import { AiPageInsights } from "@/components/ai/ai-page-insights";
import { DashboardEmptyState } from "./empty-state";
import { WeeklyDigestBanner } from "./weekly-digest-banner";
import { PinnedInsights } from "./pinned-insights";
import { DashboardLayoutProvider } from "./dashboard-layout-context";
import { PageLayoutProvider } from "@/components/providers/page-layout-context";
import { DashboardHeader } from "./dashboard-header";
import { CustomizableMetrics } from "./customizable-metrics";
import { StatsCatalog } from "./stats-catalog";
import { FormulaViewer } from "./formula-viewer";
import { DashboardGrid } from "./dashboard-grid";
import { buildHeroCards, buildHeroSwapCards } from "./dashboard-hero-data";
import { SetupPrompt, NoScenarioPrompt } from "./dashboard-prompts";
import { type CurrencyCode, isValidCurrency } from "@burnless/types";
import { deriveWidgetOrder, type LegacyWidgetLayout, type StoredPageLayout } from "@/lib/widget-order";

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default async function DashboardPage() {
  const scenarioId = await getServerScenarioId();
  const company = await getCompany();
  if (!company) return <SetupPrompt />;

  const scenario = await getActiveScenario(company.id, scenarioId);
  if (!scenario) return <NoScenarioPrompt />;

  const activeScenarioId = scenarioId ?? null;

  const [data, revenueStreams, fundingRounds, dashPrefs] =
    await Promise.all([
      computeDashboardData(company.id, activeScenarioId),
      getRevenueStreams(company.id, activeScenarioId),
      getFundingRounds(company.id, activeScenarioId),
      getDashboardPreferences().catch(() => null),
    ]);

  const { metrics, hasData, currentMonth, prevMonth } = data;

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
  // prevMonth is derived from the snapped currentMonth (data.prevMonth).
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

  const safeCurrency: CurrencyCode = isValidCurrency(company.currency) ? company.currency : "USD";
  const heroCards = buildHeroCards(heroSlugs, metrics, currentMonth, prevMonth, slugHasData, safeCurrency, company.locale);
  const heroSwapCards = buildHeroSwapCards(heroSlugs, heroCards, metrics, currentMonth, prevMonth, safeCurrency, company.locale);

  /* ── Pinned secondary metrics ───────────────────────────────────── */

  /* ── Board Meeting Mode data ──────────────────────────────────── */
  const mrrGrowthPct = pctChange(currentMrr, prevMrr) ?? 0;
  // Label the snapped "as of" month (parseMonthKey(currentMonth)), not the raw
  // calendar month, so the board header matches the KPI data it summarizes.
  const monthLabel = parseMonthKey(currentMonth)
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

  // Resolve initial widget order for PageLayoutProvider — check pageLayouts.dashboard
  // first (new `order` or legacy `layout`), then fall back to legacy root-level layout.
  const pageLayoutData = (dashPrefs?.pageLayouts as Record<string, StoredPageLayout> | undefined)?.dashboard;
  const initialOrder: string[] | undefined = pageLayoutData
    ? deriveWidgetOrder(pageLayoutData)
    : dashPrefs?.layout
      ? deriveWidgetOrder({ layout: dashPrefs.layout as LegacyWidgetLayout[] })
      : undefined;
  const initialClosedWidgets: string[] | undefined = pageLayoutData?.closedWidgets
    ? pageLayoutData.closedWidgets
    : dashPrefs?.closedWidgets
      ? (dashPrefs.closedWidgets as string[])
      : undefined;

  return (
    <PageLayoutProvider
      pageId="dashboard"
      initialOrder={initialOrder}
      initialClosedWidgets={initialClosedWidgets}
    >
      <DashboardLayoutProvider
        initialPreferences={dashPrefs ? {
          heroCards: (dashPrefs.heroCards as string[]) ?? [],
          secondaryMetrics: (dashPrefs.secondaryMetrics as string[]) ?? [],
          customMetrics: (dashPrefs.customMetrics as Array<{ id: string; name: string; formula: string; dependsOn: string[] }>) ?? [],
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
                      hasData={card.hasData}
                      allPopulated={allPopulated}
                      cardProps={card.props}
                      swapProps={swap ? {
                        originalSlug: swap.originalSlug,
                        originalLabel: swap.originalLabel,
                        restoreHint: swap.restoreHint,
                        cardProps: swap.props,
                      } : null}
                    />,
                  ];
                })
              ),

              /* ── Weekly Digest ─────────────────────────────────────── */
              "weekly-digest": <WeeklyDigestBanner />,

              /* ── Pinned Insights ─────────────────────────────────────── */
              "pinned-insights": <PinnedInsights />,

              /* ── AI Insights ────────────────────────────────────────── */
              "ai-insights": (
                <AiPageInsights
                  page="dashboard"
                  widgetId="ai-insights"
                  showChatInput
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
      </DashboardLayoutProvider>
    </PageLayoutProvider>
  );
}
