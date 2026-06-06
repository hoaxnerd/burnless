/**
 * Server-side dashboard computation — shared pipeline for computing all financial
 * data from a scenario. Used by overview, reports, and metrics pages.
 *
 * The actual compute lives in `compute-financials.ts` (`computeFinancials`) — the
 * single source of truth shared with `GET /api/metrics` and
 * `GET /api/scenarios/compare` so no surface diverges. This wrapper fetches the
 * scenario-resolved data via the cached `data.ts` helpers and adds the dashboard's
 * "as of" month (currentMonth/prevMonth).
 *
 * Uses React's cache() for request-level deduplication — multiple components
 * calling computeDashboardData with the same args in a single request only
 * trigger one computation.
 */
import { cache } from "react";
import { monthKey, previousMonthKey } from "@burnless/engine";
import {
  getAccounts,
  getForecastLines,
  getForecastValues,
  getRevenueStreams,
  getHeadcountPlans,
  getFundingRounds,
  getTransactions,
} from "./data";
import { computeFinancials, type FinancialsResult, type RevenueByType } from "./compute-financials";

export type { RevenueByType };

export interface DashboardData extends FinancialsResult {
  /**
   * The "as of" month for headline KPIs — the real calendar month. Phase B
   * carry-forward (inside computeFinancials) keeps transaction-only categories
   * non-thin past the actuals horizon, so pages read this rather than
   * recomputing monthKey(new Date()) and every surface agrees.
   */
  currentMonth: string;
  /** The month before `currentMonth` — for MoM deltas. */
  prevMonth: string;
}

export const computeDashboardData = cache(async function computeDashboardData(
  companyId: string,
  scenarioId: string | null,
  year?: number
): Promise<DashboardData> {
  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const periodStart = new Date(targetYear, 0, 1);
  const periodEnd = new Date(targetYear, 11, 1);
  const todayMonth = monthKey(new Date(now.getFullYear(), now.getMonth(), 1));

  const [accounts, fLines, revStreams, hcPlans, funding, txns] = await Promise.all([
    getAccounts(companyId),
    getForecastLines(companyId, scenarioId),
    getRevenueStreams(companyId, scenarioId),
    getHeadcountPlans(companyId, scenarioId),
    getFundingRounds(companyId, scenarioId),
    getTransactions(companyId),
  ]);
  const forecastValues = await getForecastValues(fLines.map((l) => l.id));

  const financials = computeFinancials({
    accounts,
    forecastLines: fLines,
    forecastValues,
    revenueStreams: revStreams,
    headcountPlans: hcPlans,
    fundingRounds: funding,
    transactions: txns,
    periodStart,
    periodEnd,
  });

  const currentMonth = todayMonth;
  const prevMonth = previousMonthKey(currentMonth);

  return { ...financials, currentMonth, prevMonth };
});
