/**
 * Bulk-insert helpers for the AI-suggested data the user reviews on the
 * onboarding "Review" step.
 *
 * Contract: only collections the user explicitly checked in the review UI
 * reach these functions — the route trusts what was submitted and inserts
 * verbatim. Never call these from a code path that has *not* shown the user
 * the values being persisted. The earlier silent auto-creation (a "$15k
 * monthly revenue" answer ballooning to $351k MRR via assumed churn/growth)
 * is the reason that contract exists; see commit 5f7f7da.
 */

import {
  fundingRounds,
  headcountPlans,
  forecastLines,
  revenueStreams,
  type Database,
} from "@burnless/db";
import { paramsFromUnitPricing, type RevenueStreamType } from "./revenue-params";
import type {
  SuggestedFundingRound,
  SuggestedHeadcount,
  SuggestedExpense,
  SuggestedRevenueStream,
} from "./onboarding-helpers";

/** Detailed AI-suggestion collections (no longer carried by `onboardingSchema`). */
export interface OnboardingSuggestions {
  funding_rounds?: SuggestedFundingRound[];
  headcount?: SuggestedHeadcount[];
  expenses?: SuggestedExpense[];
  revenue_streams?: SuggestedRevenueStream[];
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const FALLBACK_DEPARTMENT = "General & Admin";
const FALLBACK_EXPENSE_ACCOUNT = "Software & Tools";

interface BulkContext {
  tx: Tx;
  companyId: string;
  /** Map of account name → id, built from the freshly-inserted default accounts. */
  accountMap: Map<string, string>;
  /** Map of department name → id, built from the freshly-inserted default departments. */
  deptMap: Map<string, string>;
}

export async function insertSuggestedFundingRounds(
  ctx: BulkContext,
  rounds: OnboardingSuggestions["funding_rounds"],
): Promise<void> {
  if (!rounds || rounds.length === 0) return;
  await ctx.tx.insert(fundingRounds).values(
    rounds.map((r) => ({
      companyId: ctx.companyId,
      name: r.name,
      type: r.type,
      amount: String(r.amount),
      date: new Date(r.date),
      preMoneyValuation: r.preMoneyValuation != null ? String(r.preMoneyValuation) : null,
      dilutionPercent: r.dilutionPercent != null ? String(r.dilutionPercent) : null,
      notes: r.notes ?? null,
    })),
  );
}

export async function insertSuggestedHeadcount(
  ctx: BulkContext,
  roles: OnboardingSuggestions["headcount"],
): Promise<void> {
  if (!roles || roles.length === 0) return;
  await ctx.tx.insert(headcountPlans).values(
    roles.map((h) => {
      const departmentId = ctx.deptMap.get(h.department) ?? ctx.deptMap.get(FALLBACK_DEPARTMENT);
      if (!departmentId) {
        throw new Error(`Department "${h.department}" not found and no fallback available`);
      }
      return {
        companyId: ctx.companyId,
        departmentId,
        title: h.title,
        employeeType: h.employeeType,
        salary: String(h.salary),
        startDate: new Date(h.startDate),
        count: "1.00",
        benefitsRate: "0.20",
        parameters: {},
      };
    }),
  );
}

export async function insertSuggestedExpenses(
  ctx: BulkContext,
  expenses: OnboardingSuggestions["expenses"],
): Promise<void> {
  if (!expenses || expenses.length === 0) return;
  await ctx.tx.insert(forecastLines).values(
    expenses.map((e) => {
      const accountId = ctx.accountMap.get(e.category) ?? ctx.accountMap.get(FALLBACK_EXPENSE_ACCOUNT);
      if (!accountId) {
        throw new Error(`Account "${e.category}" not found and no fallback available`);
      }
      return {
        companyId: ctx.companyId,
        accountId,
        method: "fixed" as const,
        parameters: { amount: e.amount },
        startDate: new Date(e.startDate),
        isRecurring: e.isRecurring,
        isOneTime: !e.isRecurring,
        frequency: "monthly" as const,
        // `forecast_lines` has no `name` column — surface the expense name
        // in `notes` so the user sees "AWS Hosting" rather than the bare
        // account category on the expenses list.
        notes: e.name,
      };
    }),
  );
}

export async function insertSuggestedRevenueStreams(
  ctx: BulkContext,
  streams: OnboardingSuggestions["revenue_streams"],
): Promise<void> {
  if (!streams || streams.length === 0) return;
  await ctx.tx.insert(revenueStreams).values(
    streams.map((r) => ({
      companyId: ctx.companyId,
      name: r.name,
      type: r.type,
      startDate: new Date(r.startDate),
      parameters: paramsFromUnitPricing(r.type as RevenueStreamType, r.amount, r.quantity),
    })),
  );
}

/**
 * Apply every suggestion collection the user opted into. Order is independent
 * — each call is gated by its own length check — so this stays a simple list
 * rather than a builder pattern.
 */
export async function applyOnboardingSuggestions(
  ctx: BulkContext,
  body: OnboardingSuggestions,
): Promise<void> {
  await insertSuggestedFundingRounds(ctx, body.funding_rounds);
  await insertSuggestedHeadcount(ctx, body.headcount);
  await insertSuggestedExpenses(ctx, body.expenses);
  await insertSuggestedRevenueStreams(ctx, body.revenue_streams);
}
