/**
 * Page-specific AI insight generation — uses LLM to create contextual
 * narrative insights for Expenses, Revenue, and Scenarios pages.
 *
 * Uses the "fast" model tier (Haiku-class) for cost efficiency.
 * Insights are short-form, data-driven, and actionable.
 */

import type { FinancialSnapshot, Insight, InsightType } from "./types";
import { getProviderForFeature } from "./routing";
import { createProvider, type CreateProviderOptions } from "./providers";

// ── Page types ──────────────────────────────────────────────────────────────

export type InsightPage = "expenses" | "revenue" | "scenarios" | "funding" | "team" | "reports";

export interface PageInsightContext {
  page: InsightPage;
  snapshot: FinancialSnapshot;
  /** Page-specific data to give the LLM richer context */
  pageData?: Record<string, unknown>;
  /** Override provider config (e.g., from per-company DB settings). */
  providerConfig?: CreateProviderOptions;
}

export interface PageInsight {
  type: InsightType;
  title: string;
  summary: string;
  severity: "info" | "warning" | "critical";
}

// ── Feature key for model routing (maps to "fast" tier) ─────────────────────

const FEATURE_KEY = "page_insights";

// ── Prompt builders per page ────────────────────────────────────────────────

function buildExpensesPrompt(snapshot: FinancialSnapshot, pageData?: Record<string, unknown>): string {
  const { keyMetrics, expensesByMonth, company } = snapshot;
  const currency = company.currency;

  const recentExpenses = expensesByMonth.slice(-3);
  const expenseLines = recentExpenses
    .map((e) => `  ${e.month}: ${currency} ${e.amount.toLocaleString()}`)
    .join("\n");

  const subcategories = pageData?.subcategoryBreakdown as Array<{
    subcategory: string;
    amount: number;
    changePercent: number;
    isAnomaly: boolean;
  }> | undefined;

  const subcatLines = subcategories
    ?.slice(0, 8)
    .map((s) => `  ${s.subcategory}: ${currency} ${s.amount.toLocaleString()} (${s.changePercent >= 0 ? "+" : ""}${(s.changePercent * 100).toFixed(0)}% MoM)${s.isAnomaly ? " [ANOMALY]" : ""}`)
    .join("\n") ?? "  No subcategory data available";

  const anomalyCount = pageData?.anomalyCount ?? 0;
  const recurringCount = pageData?.recurringCount ?? 0;

  return `You are a senior financial advisor analyzing a startup's expenses. Be direct and data-driven.

Company: ${company.name} (${company.stage}, ${company.businessModel})
Currency: ${currency}
Burn Rate: ${currency} ${keyMetrics.burnRate?.toLocaleString() ?? "N/A"}/month
Runway: ${keyMetrics.runway?.toFixed(1) ?? "N/A"} months

Recent Monthly Expenses:
${expenseLines}

Spend by Category:
${subcatLines}

Anomalies detected: ${anomalyCount}
Recurring charges: ${recurringCount}

Generate exactly 3 insights as JSON array. Each insight must have: type (one of "variance_analysis", "benchmark", "coaching"), title (max 60 chars), summary (1-2 sentences, lead with the number), severity ("info", "warning", or "critical").

Focus on:
1. Biggest spend anomaly or notable MoM change (explain what drove it)
2. Spend optimization opportunity (overlapping tools, renegotiation, benchmarks)
3. Category insight with stage-appropriate benchmark comparison

Rules: Lead with numbers. Be specific. No filler. If data is insufficient for an insight, skip it.
Return ONLY the JSON array, no markdown fences.`;
}

function buildRevenuePrompt(snapshot: FinancialSnapshot, pageData?: Record<string, unknown>): string {
  const { keyMetrics, revenueByMonth, company } = snapshot;
  const currency = company.currency;

  const recentRevenue = revenueByMonth.slice(-3);
  const revLines = recentRevenue
    .map((r) => `  ${r.month}: ${currency} ${r.amount.toLocaleString()}`)
    .join("\n");

  const growthMetrics = pageData?.growthMetrics as {
    currentMrr: number;
    mrrGrowthPercent: number;
    arr: number;
    churnRate: number;
    ltv: number;
    quickRatio: number;
    doublingTimeMonths: number | null;
    totalCustomers: number;
  } | undefined;

  const streams = pageData?.streamBreakdown as Array<{
    name: string;
    type: string;
    currentRevenue: number;
    percentage: number;
    changePercent: number;
  }> | undefined;

  const streamLines = streams
    ?.slice(0, 5)
    .map((s) => `  ${s.name} (${s.type}): ${currency} ${s.currentRevenue.toLocaleString()} (${(s.percentage).toFixed(0)}% of total, ${s.changePercent >= 0 ? "+" : ""}${(s.changePercent * 100).toFixed(0)}% MoM)`)
    .join("\n") ?? "  No stream data";

  return `You are a senior financial advisor analyzing a startup's revenue. Be direct and data-driven.

Company: ${company.name} (${company.stage}, ${company.businessModel})
Currency: ${currency}
MRR: ${currency} ${growthMetrics?.currentMrr?.toLocaleString() ?? keyMetrics.mrr?.toLocaleString() ?? "N/A"}
ARR: ${currency} ${growthMetrics?.arr?.toLocaleString() ?? keyMetrics.arr?.toLocaleString() ?? "N/A"}
MRR Growth: ${growthMetrics?.mrrGrowthPercent?.toFixed(1) ?? keyMetrics.revenueGrowth?.toFixed(1) ?? "N/A"}% MoM
Churn Rate: ${growthMetrics?.churnRate?.toFixed(1) ?? keyMetrics.churnRate?.toFixed(1) ?? "N/A"}%
LTV: ${currency} ${growthMetrics?.ltv?.toLocaleString() ?? keyMetrics.ltv?.toLocaleString() ?? "N/A"}
Customers: ${growthMetrics?.totalCustomers ?? "N/A"}
Quick Ratio: ${growthMetrics?.quickRatio?.toFixed(1) ?? "N/A"}
Doubling Time: ${growthMetrics?.doublingTimeMonths?.toFixed(0) ?? "N/A"} months

Recent Monthly Revenue:
${revLines}

Revenue Streams:
${streamLines}

Generate exactly 3 insights as JSON array. Each insight must have: type (one of "financial_narrative", "benchmark", "coaching"), title (max 60 chars), summary (1-2 sentences, lead with the number), severity ("info", "warning", or "critical").

Focus on:
1. Growth narrative — what's driving revenue and at what rate
2. Projection or milestone — when the company hits a meaningful target (e.g., $1M ARR)
3. Concentration risk or retention insight — flag if top customers dominate revenue or if churn is concerning

Rules: Lead with numbers. Be specific. No filler. If data is insufficient for an insight, skip it.
Return ONLY the JSON array, no markdown fences.`;
}

function buildScenariosPrompt(snapshot: FinancialSnapshot): string {
  const { keyMetrics, scenarios, company } = snapshot;
  const currency = company.currency;

  const scenarioLines = scenarios
    .map((s) => `  ${s.name} (${s.source})${s.status !== "active" ? ` [${s.status}]` : ""}`)
    .join("\n");

  return `You are a senior financial advisor analyzing a startup's financial scenarios. Be direct and data-driven.

Company: ${company.name} (${company.stage}, ${company.businessModel})
Currency: ${currency}
Current Cash: ${currency} ${keyMetrics.cashPosition?.toLocaleString() ?? "N/A"}
Burn Rate: ${currency} ${keyMetrics.burnRate?.toLocaleString() ?? "N/A"}/month
Runway: ${keyMetrics.runway?.toFixed(1) ?? "N/A"} months
MRR: ${currency} ${keyMetrics.mrr?.toLocaleString() ?? "N/A"}
Headcount: ${keyMetrics.headcount ?? "N/A"}

Available Scenarios:
${scenarioLines || "  No scenarios created yet"}

Generate exactly 3 insights as JSON array. Each insight must have: type (one of "coaching", "financial_narrative", "benchmark"), title (max 60 chars), summary (1-2 sentences, lead with the number), severity ("info", "warning", or "critical").

Focus on:
1. Comparison insight — if multiple scenarios exist, note the most impactful trade-off. If only one, suggest what scenarios to create.
2. Recommendation — which strategic approach gives the best survival/growth probability given current metrics
3. Sensitivity insight — what single variable most affects runway or growth (e.g., hiring pace, cloud costs, pricing)

Rules: Lead with numbers. Be specific. No filler. If data is insufficient for an insight, skip it.
Return ONLY the JSON array, no markdown fences.`;
}

function buildFundingPrompt(snapshot: FinancialSnapshot, pageData?: Record<string, unknown>): string {
  const { keyMetrics, company } = snapshot;
  const currency = company.currency;

  const fundingRounds = pageData?.fundingRounds as Array<{
    name: string;
    type: string;
    amount: number;
    date: string;
    isProjected: boolean;
  }> | undefined;

  const roundLines = fundingRounds
    ?.map((r) => `  ${r.name} (${r.type}): ${currency} ${r.amount.toLocaleString()} — ${r.date}${r.isProjected ? " [projected]" : ""}`)
    .join("\n") ?? "  No funding rounds recorded";

  return `You are a senior financial advisor analyzing a startup's fundraising position. Be direct and data-driven.

Company: ${company.name} (${company.stage}, ${company.businessModel})
Currency: ${currency}
Cash Position: ${currency} ${keyMetrics.cashPosition?.toLocaleString() ?? "N/A"}
Burn Rate: ${currency} ${keyMetrics.burnRate?.toLocaleString() ?? "N/A"}/month
Runway: ${keyMetrics.runway?.toFixed(1) ?? "N/A"} months
MRR: ${currency} ${keyMetrics.mrr?.toLocaleString() ?? "N/A"}
Revenue Growth: ${keyMetrics.revenueGrowth?.toFixed(1) ?? "N/A"}% MoM

Funding History:
${roundLines}

Generate exactly 3 insights as JSON array. Each insight must have: type (one of "coaching", "financial_narrative", "benchmark"), title (max 60 chars), summary (1-2 sentences, lead with the number), severity ("info", "warning", or "critical").

Focus on:
1. Fundraising readiness — based on runway, growth rate, and stage, assess timing urgency
2. Round sizing — given current burn and growth trajectory, suggest appropriate round size and expected valuation range
3. Investor narrative — what metrics are strong vs weak for the next fundraise

Rules: Lead with numbers. Be specific. No filler. If data is insufficient for an insight, skip it.
Return ONLY the JSON array, no markdown fences.`;
}

function buildTeamPrompt(snapshot: FinancialSnapshot, pageData?: Record<string, unknown>): string {
  const { keyMetrics, company } = snapshot;
  const currency = company.currency;

  const departments = pageData?.departments as Array<{
    name: string;
    headcount: number;
    monthlyCost: number;
  }> | undefined;

  const deptLines = departments
    ?.map((d) => `  ${d.name}: ${d.headcount} people, ${currency} ${d.monthlyCost.toLocaleString()}/mo`)
    .join("\n") ?? "  No department data";

  const plannedHires = pageData?.plannedHires as number | undefined;

  return `You are a senior financial advisor analyzing a startup's team and headcount plan. Be direct and data-driven.

Company: ${company.name} (${company.stage}, ${company.businessModel})
Currency: ${currency}
Burn Rate: ${currency} ${keyMetrics.burnRate?.toLocaleString() ?? "N/A"}/month
Runway: ${keyMetrics.runway?.toFixed(1) ?? "N/A"} months
Headcount: ${keyMetrics.headcount ?? "N/A"}
Revenue per Employee: ${keyMetrics.mrr && keyMetrics.headcount ? `${currency} ${Math.round(keyMetrics.mrr / keyMetrics.headcount).toLocaleString()}/mo` : "N/A"}
Planned Hires: ${plannedHires ?? 0}

Departments:
${deptLines}

Generate exactly 3 insights as JSON array. Each insight must have: type (one of "coaching", "benchmark", "financial_narrative"), title (max 60 chars), summary (1-2 sentences, lead with the number), severity ("info", "warning", or "critical").

Focus on:
1. Hiring impact — how planned hires affect runway and burn rate
2. Team efficiency — revenue per employee vs stage benchmarks, department balance
3. Timing recommendation — given runway and growth, optimal hiring pace

Rules: Lead with numbers. Be specific. No filler. If data is insufficient for an insight, skip it.
Return ONLY the JSON array, no markdown fences.`;
}

function buildReportsPrompt(snapshot: FinancialSnapshot): string {
  const { keyMetrics, company } = snapshot;
  const currency = company.currency;

  return `You are a senior financial advisor preparing executive-level insights for a board report. Be direct and data-driven.

Company: ${company.name} (${company.stage}, ${company.businessModel})
Currency: ${currency}
MRR: ${currency} ${keyMetrics.mrr?.toLocaleString() ?? "N/A"}
ARR: ${currency} ${keyMetrics.arr?.toLocaleString() ?? "N/A"}
Revenue Growth: ${keyMetrics.revenueGrowth?.toFixed(1) ?? "N/A"}% MoM
Burn Rate: ${currency} ${keyMetrics.burnRate?.toLocaleString() ?? "N/A"}/month
Runway: ${keyMetrics.runway?.toFixed(1) ?? "N/A"} months
Cash Position: ${currency} ${keyMetrics.cashPosition?.toLocaleString() ?? "N/A"}
Gross Margin: ${keyMetrics.grossMargin?.toFixed(1) ?? "N/A"}%
Headcount: ${keyMetrics.headcount ?? "N/A"}

Generate exactly 3 insights as JSON array. Each insight must have: type (one of "financial_narrative", "benchmark", "coaching"), title (max 60 chars), summary (1-2 sentences, lead with the number), severity ("info", "warning", or "critical").

Focus on:
1. Overall health — one-sentence verdict on the company's financial trajectory
2. Key risk — the single biggest financial risk right now (runway, churn, concentration, margin compression)
3. Board-ready highlight — one metric or trend that tells the strongest story for investors

Rules: Lead with numbers. Be specific. No filler. If data is insufficient for an insight, skip it.
Return ONLY the JSON array, no markdown fences.`;
}

// ── Main generation function ────────────────────────────────────────────────

/**
 * Generate AI-powered page-specific insights using the fast model tier.
 *
 * Returns an array of 1-3 insights. Falls back to empty array on failure.
 * Designed to be cached per-page per-day by the API route.
 */
export async function generatePageInsights(
  context: PageInsightContext
): Promise<PageInsight[]> {
  const provider = context.providerConfig?.apiKey
    ? createProvider(context.providerConfig)
    : getProviderForFeature(FEATURE_KEY);
  if (!provider) {
    return [];
  }

  let prompt: string;
  switch (context.page) {
    case "expenses":
      prompt = buildExpensesPrompt(context.snapshot, context.pageData);
      break;
    case "revenue":
      prompt = buildRevenuePrompt(context.snapshot, context.pageData);
      break;
    case "scenarios":
      prompt = buildScenariosPrompt(context.snapshot);
      break;
    case "funding":
      prompt = buildFundingPrompt(context.snapshot, context.pageData);
      break;
    case "team":
      prompt = buildTeamPrompt(context.snapshot, context.pageData);
      break;
    case "reports":
      prompt = buildReportsPrompt(context.snapshot);
      break;
    default:
      return [];
  }

  try {
    const text = await provider.generateText(prompt);

    // Parse JSON response — handle potential markdown fences
    const cleaned = text.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) return [];

    // Validate and normalize each insight
    return parsed
      .filter(
        (item: unknown): item is PageInsight =>
          typeof item === "object" &&
          item !== null &&
          "title" in item &&
          "summary" in item
      )
      .slice(0, 3)
      .map((item) => ({
        type: validateInsightType(item.type) ? item.type : "coaching",
        title: String(item.title).slice(0, 80),
        summary: String(item.summary).slice(0, 300),
        severity: validateSeverity(item.severity) ? item.severity : "info",
      }));
  } catch (err) {
    console.error(
      `[page-insights] Failed to generate ${context.page} insights:`,
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

// ── Validators ──────────────────────────────────────────────────────────────

const VALID_TYPES: InsightType[] = [
  "variance_analysis",
  "runway_alert",
  "financial_narrative",
  "benchmark",
  "coaching",
];

function validateInsightType(t: unknown): t is InsightType {
  return typeof t === "string" && VALID_TYPES.includes(t as InsightType);
}

function validateSeverity(s: unknown): s is "info" | "warning" | "critical" {
  return s === "info" || s === "warning" || s === "critical";
}
