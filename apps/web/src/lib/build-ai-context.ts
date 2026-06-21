/**
 * Shared helper to build AI financial context from a company + scenario.
 * Used by both /api/chat and /api/insights routes.
 */

import { db, companies } from "@burnless/db";
import { eq } from "drizzle-orm";
import {
  buildFinancialSnapshot,
  formatContextForPrompt,
  type FinancialSnapshot,
} from "@burnless/ai";
import { computeDashboardData } from "./compute-dashboard";
import {
  getScenarios,
  getAccounts,
  getDepartments,
  getFundingRounds,
} from "./data";

interface ScenarioRef {
  id: string;
  name: string;
  source: string;
}

/**
 * Format the current time in a given timezone for the AI companion's "now" context.
 * Returns a string like "2026-06-21T20:34 (Saturday)".
 * CACHE SAFETY: this helper is called per-request in buildAiContext, never inside
 * unstable_cache. The result is returned as `nowContext` and must NOT be written
 * into the cached FinancialSnapshot or contextText.
 */
function formatNowInZone(date: Date, timeZone: string): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone, hour12: false, weekday: "long",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute} (${p.weekday})`;
}

export async function buildAiContext(
  companyId: string,
  scenario: ScenarioRef
): Promise<{ snapshot: FinancialSnapshot; contextText: string; nowContext: { iso: string; timezone: string } }> {
  const [companyRows, dashboard, allScenarios, accounts, depts, funding] =
    await Promise.all([
      db.select().from(companies).where(eq(companies.id, companyId)).limit(1),
      computeDashboardData(companyId, scenario.id),
      getScenarios(companyId),
      getAccounts(companyId),
      getDepartments(companyId),
      getFundingRounds(companyId, scenario.id),
    ]);

  const company = companyRows[0];

  // CACHE SAFETY: only the stable timezone string goes into the snapshot (which
  // may be cached). The live "now" is computed fresh per request below and
  // returned as `nowContext` — it is never written into the cached snapshot.
  const timezone = company?.timezone ?? "America/New_York";

  const snapshot = buildFinancialSnapshot({
    company: {
      name: company?.name ?? "Company",
      stage: company?.stage ?? "seed",
      businessModel: company?.businessModel ?? "saas",
      industry: company?.industry ?? null,
      currency: company?.currency ?? "USD",
      locale: company?.locale ?? "en-US",
      timezone,
    },
    scenario: {
      id: scenario.id,
      name: scenario.name,
      source: scenario.source,
    },
    scenarios: allScenarios.map((s) => ({
      id: s.id,
      name: s.name,
      source: s.source,
      status: s.status,
    })),
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      category: a.category,
    })),
    departments: depts.map((d) => ({ id: d.id, name: d.name })),
    period: {
      start: dashboard.periodStart.toISOString().slice(0, 7),
      end: dashboard.periodEnd.toISOString().slice(0, 7),
      currentMonth: dashboard.currentMonth,
    },
    metrics: dashboard.metrics,
    totalRevenue: dashboard.totalRevenue,
    totalExpenses: dashboard.totalExpenses,
    cashPosition: dashboard.cashPosition,
    headcountSeries: dashboard.headcountSeries,
    profitAndLoss: dashboard.profitAndLoss,
    fundingRounds: funding.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      amount: Number(f.amount),
      date: new Date(f.date).toISOString().slice(0, 10),
      closeDate: f.closeDate ? new Date(f.closeDate).toISOString().slice(0, 10) : null,
      isProjected: f.isProjected,
      parameters: (f.parameters as Record<string, unknown> | null) ?? {},
    })),
    // Phase 1 §1.5: per-headcount detail (Team Detail section in the prompt).
    // Wire-up to the salary-changes / bonuses / equity-grants resolvers will
    // land alongside the team UI; until then, pass an empty array so the
    // contract is honoured but the section is suppressed.
    headcountDetails: [],
  });

  const contextText = formatContextForPrompt(snapshot);

  // Per-request live "now" in the company's timezone. NOT written into the
  // cached snapshot — passed to callers as `nowContext` for them to thread
  // into ChatOptions.nowContext on each live request.
  const nowContext = { iso: formatNowInZone(new Date(), timezone), timezone };

  return { snapshot, contextText, nowContext };
}
