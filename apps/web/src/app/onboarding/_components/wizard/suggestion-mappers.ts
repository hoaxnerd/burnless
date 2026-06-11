/**
 * Pure mappers: onboarding enrich-SSE suggestion shapes → the wizard step
 * panels' suggestion-prop shapes (the REAL production form value types).
 *
 * The enrich SSE emits AI suggestions in the loose shapes defined in
 * `../types.ts` (`RevenueStream`, `FundingRound`, `OperatingExpense`,
 * `HeadcountRole`). Each wizard step, however, hosts a real production form and
 * consumes that form's own value shape. These functions bridge the two.
 *
 * NO React, NO network — pure functions only. Best-effort but TYPE-VALID: the
 * goal is "opens a valid, prefilled form the user reviews/edits", not perfect
 * economic modeling. We reuse the forms' own default/param helpers so we never
 * invent a param schema.
 *
 * Task 14a of S4b. Spec: docs/superpowers/specs/2026-06-12-s4b-onboarding-wizard-design.md
 */

import type {
  RevenueStream,
  FundingRound,
  OperatingExpense,
  HeadcountRole,
} from "../types";
import type { RevenueStreamFormValues } from "@/app/(dashboard)/revenue/revenue-stream-form";
import type { FundingRoundSubmitPayload } from "@/app/(dashboard)/funding/funding-round-form";
import type { ExpenseRow } from "@/app/(dashboard)/expenses/expense-form";
import type { EditableHeadcount } from "@/app/(dashboard)/team/headcount-form";
import {
  paramsFromUnitPricing,
  type RevenueStreamType,
} from "@/lib/revenue-params";
import { defaultParamsForType as fundingDefaultParamsForType } from "@/lib/funding-params";
import type { ForecastMethod } from "@/lib/expense-params";

// ── Revenue ───────────────────────────────────────────────────────────────────

/**
 * Map SSE `RevenueStream[]` → `RevenueStreamFormValues[]`.
 *
 * The 7 SSE `type` values (subscription/one_time/usage_based/services/
 * marketplace/ecommerce/hardware) are exactly the `RevenueStreamType` union, so
 * `type` passes through directly. `parameters` is built from the SSE
 * `amount`/`quantity` pair via the form's own `paramsFromUnitPricing` helper,
 * which slots the values into each type's canonical field names (e.g.
 * subscription → monthlyPrice/startingCustomers). `endDate` is null (open-ended).
 */
export function toRevenueSuggestions(
  streams: RevenueStream[],
): RevenueStreamFormValues[] {
  return streams.map((s) => {
    // SSE type is a subset of RevenueStreamType — direct, exhaustive pass-through.
    const type = s.type satisfies RevenueStreamType;
    return {
      name: s.name,
      type,
      startDate: s.startDate,
      endDate: null,
      parameters: paramsFromUnitPricing(type, s.amount, s.quantity),
    };
  });
}

// ── Funding ─────────────────────────────────────────────────────────────────

/**
 * Map SSE `FundingRound[]` → `FundingRoundSubmitPayload[]`.
 *
 * The SSE `type` (pre_seed|seed|series_a|series_b|series_c_plus|debt|grant) is a
 * subset of `FundingRoundType` (which also has safe|convertible), so it passes
 * through to `roundType` directly. `parameters` come from the funding form's own
 * `defaultParamsForType`. `closeDate` is null, `isProjected` false, and `notes`
 * falls back to null.
 */
export function toFundingSuggestions(
  rounds: FundingRound[],
): FundingRoundSubmitPayload[] {
  return rounds.map((r) => {
    const roundType = r.type; // FundingRound["type"] ⊂ FundingRoundType
    return {
      name: r.name,
      roundType,
      amount: r.amount,
      date: r.date,
      closeDate: null,
      notes: r.notes ?? null,
      parameters: fundingDefaultParamsForType(roundType),
      isProjected: false,
    };
  });
}

// ── Expenses ──────────────────────────────────────────────────────────────────

/**
 * Map SSE `OperatingExpense[]` → `ExpenseRow[]`.
 *
 * Resolves the suggestion's `category` (a display name like "Cloud
 * Infrastructure") to an `accountId` by case-insensitive name match against the
 * provided accounts; falls back to the first `operating_expense` account (or the
 * first account of any category if none is operating_expense). The amount maps to
 * the `fixed` forecast method's single `amount` parameter — the simplest
 * type-valid expense shape. `subcategory` carries the original category name so
 * the form's account-mapping fallback (which keys off subcategory/name) still
 * resolves if accounts change.
 */
export function toExpenseSuggestions(
  expenses: OperatingExpense[],
  accounts: { id: string; name: string; category: string }[],
): ExpenseRow[] {
  const fallbackAccountId =
    accounts.find((a) => a.category === "operating_expense")?.id ??
    accounts[0]?.id ??
    "";

  const method: ForecastMethod = "fixed";

  return expenses.map((e, i) => {
    const wanted = e.category.trim().toLowerCase();
    const match = accounts.find((a) => a.name.trim().toLowerCase() === wanted);
    const accountId = match?.id ?? fallbackAccountId;
    return {
      id: e.id ?? `expense-suggestion-${i}`,
      accountId,
      method,
      parameters: { amount: e.amount },
      startDate: e.startDate,
      endDate: null,
      name: e.name,
      subcategory: e.category,
      isRecurring: e.isRecurring,
    };
  });
}

// ── Headcount ─────────────────────────────────────────────────────────────────

/**
 * Map SSE `HeadcountRole[]` → `EditableHeadcount[]`.
 *
 * Resolves the suggestion's `department` (a display name like "Engineering") to a
 * `departmentId` by case-insensitive name match; falls back to the first
 * department. Salary, title, employeeType, startDate pass through. Count defaults
 * to 1; hourly fields and parameters are null; benefitsRate defaults to 0.2 (20%);
 * endDate is null (open-ended).
 */
export function toHeadcountSuggestions(
  roles: HeadcountRole[],
  departments: { id: string; name: string }[],
): EditableHeadcount[] {
  const fallbackDepartmentId = departments[0]?.id ?? "";

  return roles.map((r, i) => {
    const wanted = r.department.trim().toLowerCase();
    const match = departments.find((d) => d.name.trim().toLowerCase() === wanted);
    const departmentId = match?.id ?? fallbackDepartmentId;
    return {
      id: r.id ?? `headcount-suggestion-${i}`,
      departmentId,
      title: r.title,
      employeeType: r.employeeType,
      count: 1,
      salary: r.salary,
      hourlyRate: null,
      hoursPerWeek: null,
      startDate: r.startDate,
      endDate: null,
      benefitsRate: 0.2,
      parameters: null,
    };
  });
}
