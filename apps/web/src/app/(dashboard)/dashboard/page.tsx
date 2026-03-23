export const dynamic = "force-dynamic";
export const revalidate = 0;

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
import {
  seriesToArray,
  monthKey,
  DEFAULT_HERO_CARDS,
  getHeroSwaps,
  extractMetricValue,
  formatMetricValue,
  getMetricMissingDataHint,
  getMetricDef,
  isMetricDataAvailable,
} from "@burnless/engine";
import { type KpiVariant } from "./hero-kpi-card";
import { HeroCardGrid, type HeroCardDatum, type SwapCardDatum } from "./hero-card-grid";
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
  const prevCash = safeNum(metrics.cashPosition.find((m) => m.month === prevMonth)?.value, data.startingCash);
  const prevBurn = safeNum(metrics.netBurnRate.find((m) => m.month === prevMonth)?.value, 0);
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
      ? (dashPrefs.heroCards as string[])
      : DEFAULT_HERO_CARDS;

  // Known default slug → variant mapping for the 4 built-in hero cards
  const SLUG_VARIANT: Record<string, KpiVariant> = {
    cashPosition: "cash",
    netBurnRate: "burn",
    cashRunwayMonths: "runway",
    mrr: "revenue",
  };
  const variantOrder: KpiVariant[] = ["cash", "burn", "runway", "revenue"];

  // Special hasData checks for known defaults (context-dependent, not just data presence)
  const SLUG_HAS_DATA: Record<string, boolean> = {
    cashPosition: hasFunding,
    netBurnRate: hasExpenses,
    cashRunwayMonths: hasFunding && hasExpenses,
    mrr: hasRevenue,
  };

  // Build hero card data for each slug
  const heroCards: HeroCardDatum[] = heroSlugs.map((slug, i) => {
    const def = getMetricDef(slug);
    const variant = SLUG_VARIANT[slug] ?? variantOrder[i % variantOrder.length];
    const hasData = slug in SLUG_HAS_DATA
      ? SLUG_HAS_DATA[slug]
      : isMetricDataAvailable(metrics, slug, currentMonth);

    const currentVal = extractMetricValue(metrics, slug, currentMonth) ?? 0;
    const prevVal = extractMetricValue(metrics, slug, prevMonth) ?? 0;

    // Format value based on metric definition
    let formattedValue: string;
    if (!hasData) {
      formattedValue = def?.format === "months" ? "-- mo" : "$---";
    } else if (def) {
      formattedValue = formatMetricValue(currentVal, def.format);
    } else {
      formattedValue = formatCurrency(currentVal);
    }

    // MoM change
    let change: string | undefined;
    let changeLabel: string | undefined;
    if (hasData && prevVal !== 0) {
      if (def?.format === "percent") {
        const diff = currentVal - prevVal;
        if (diff !== 0 && Number.isFinite(diff)) {
          change = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp`;
          changeLabel = "vs last month";
        }
      } else {
        change = pctChange(currentVal, prevVal) ?? undefined;
        changeLabel = change ? "vs last month" : undefined;
      }
    }

    // Sparkline data
    const series = (metrics as unknown as Record<string, Array<{ month: string; value: number }>>)[slug];
    const sparkData = hasData && Array.isArray(series) ? sparkline(series) : undefined;

    // For non-default metrics, use metricStyle from the registry
    const isKnownDefault = slug in SLUG_VARIANT;
    const metricStyle = !isKnownDefault && def
      ? { icon: def.icon, color: def.color, href: def.href }
      : undefined;

    return {
      variant,
      hasData,
      props: {
        slug,
        label: def?.name ?? slug,
        value: formattedValue,
        change,
        changeLabel,
        description: !hasData
          ? (getMetricMissingDataHint(slug) ?? (def?.description))
          : undefined,
        sparkData,
        metricStyle,
      },
    };
  });

  // Build swap cards from engine's hero swap computation (only for the known defaults)
  const heroSwaps = getHeroSwaps(DEFAULT_HERO_CARDS, metrics, currentMonth);
  const heroSwapCards: SwapCardDatum[] = [];
  for (let i = 0; i < heroSwaps.length; i++) {
    const swap = heroSwaps[i];
    if (!swap || !swap.replacedSlug) continue;

    // Find the actual index in heroSlugs for this default slug
    const defaultSlug = DEFAULT_HERO_CARDS[i];
    const heroIndex = heroSlugs.indexOf(defaultSlug);
    if (heroIndex === -1) continue; // User removed this default card

    const swapCurrentVal = extractMetricValue(metrics, swap.displaySlug, currentMonth) ?? 0;
    const swapPrevVal = extractMetricValue(metrics, swap.displaySlug, prevMonth) ?? 0;
    const formattedSwapValue = formatMetricValue(swapCurrentVal, swap.displayDef.format);

    let swapChange: string | undefined;
    if (swap.displayDef.format === "percent") {
      const diff = swapCurrentVal - swapPrevVal;
      if (swapPrevVal !== 0 && diff !== 0 && Number.isFinite(diff)) {
        swapChange = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp`;
      }
    } else if (swapPrevVal !== 0) {
      const pct = ((swapCurrentVal - swapPrevVal) / Math.abs(swapPrevVal)) * 100;
      if (pct !== 0 && Number.isFinite(pct)) {
        swapChange = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
      }
    }

    const swapSeries = (metrics as unknown as Record<string, Array<{ month: string; value: number }>>)[swap.displaySlug];
    const swapSparkData = Array.isArray(swapSeries) ? sparkline(swapSeries) : undefined;

    heroSwapCards.push({
      slotIndex: heroIndex,
      originalLabel: heroCards[heroIndex]?.props.label ?? "",
      originalSlug: swap.replacedSlug,
      restoreHint: swap.restoreHint ?? getMetricMissingDataHint(swap.replacedSlug),
      variant: variantOrder[heroIndex % variantOrder.length],
      props: {
        slug: swap.displaySlug,
        label: swap.displayDef.name,
        value: formattedSwapValue,
        change: swapChange,
        changeLabel: swapChange ? "vs last month" : undefined,
        metricStyle: {
          icon: swap.displayDef.icon,
          color: swap.displayDef.color,
          href: swap.displayDef.href,
        },
      },
    });
  }

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
        layout: (dashPrefs.layout as Array<{ widgetId: string; x: number; y: number; w: number; h: number }>) ?? [],
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
              "scenarios": pinnedScenarios.length > 0 ? (
                <div className="h-full rounded-2xl bg-surface-0 border border-surface-200 p-5 sm:p-6 hover-lift">
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
              ) : (
                <div className="h-full rounded-2xl bg-surface-50/50 border border-dashed border-surface-200 p-5 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-sm text-surface-400 mb-2">No scenarios yet</p>
                    <Link href="/scenarios/new" className="text-xs font-medium text-brand-500 hover:text-brand-600">
                      Create scenario
                    </Link>
                  </div>
                </div>
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
