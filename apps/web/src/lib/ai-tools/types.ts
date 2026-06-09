/**
 * Shared types, Zod schemas, and helpers for AI tool modules.
 */

import { z } from "zod";

// ── Context ──────────────────────────────────────────────────────────────────

export interface ToolContext {
  companyId?: string;
  /** AI-01: the WRITE target. `null`/`undefined` = base view → the scenario-mutate
   *  facade writes to base tables (`ctx.scenarioId ?? null`); a non-null id targets
   *  that scenario's overlay. Nullable (not just optional) so the chat route can
   *  thread an explicit base-view null distinct from an absent value. */
  scenarioId?: string | null;
  userId: string;
  conversationId?: string;
  /** How this call was authorized — recorded in the audit log. */
  permissionDecision?: "auto" | "granted_once" | "granted_session" | "denied";
  /** Execution mode (spec §4.2). "plan" computes the override delta WITHOUT
   *  writing, skips cache invalidation, and audits pending_apply. "commit"
   *  (default) is today's behavior: write + invalidate + audit success. */
  mode?: "plan" | "commit";
}

// ── Validation primitives ────────────────────────────────────────────────────

/** Safely name strings — non-empty, bounded length. */
export const nameString = z.string().min(1, "Name is required").max(200, "Name too long (max 200 chars)");

/** Optional description string, bounded length. */
export const descriptionString = z.string().max(2000, "Description too long").optional().nullable();

/** UUID or cuid-style identifier. */
export const idString = z.string().min(1, "ID is required").max(100);

/** Optional ID — falls back to context. */
export const optionalId = z.string().min(1).max(100).optional();

/** Financial amount — must be non-negative, capped at $100B to prevent absurd values. */
export const financialAmount = z.number().nonnegative("Amount must be >= 0").max(100_000_000_000, "Amount exceeds $100B limit");

/** Growth/interest rate — bounded between -100% and 10,000% (100x). */
export const rateValue = z.number().min(-1, "Rate cannot be below -100%").max(100, "Rate cannot exceed 10,000%");

/** Percentage 0-1 range. */
export const percentFraction = z.number().min(0, "Percentage must be >= 0").max(1, "Percentage must be <= 100%");

/** Headcount — positive integer, bounded. Kept for back-compat. */
export const headcount = z.number().int("Count must be a whole number").min(1, "Count must be >= 1").max(100_000, "Count exceeds 100,000 limit");

/** Headcount FTE — fractional, bounded. Used by Phase-1 headcount fields (0.5 = half-time). */
export const headcountFte = z.number().min(0, "Count must be >= 0").max(99.99, "Count exceeds 99.99 limit");

/** Salary — positive, bounded. */
export const salaryAmount = z.number().positive("Salary must be > 0").max(100_000_000, "Salary exceeds $100M limit");

/** Hourly rate — non-negative, nullable optional. */
export const hourlyRate = z.number().nonnegative("Hourly rate must be >= 0").max(10_000, "Hourly rate exceeds $10,000 limit").nullable().optional();

/** Hours per week — 0 to 168, nullable optional. */
export const hoursPerWeek = z.number().min(0, "Hours per week must be >= 0").max(168, "Hours per week cannot exceed 168").nullable().optional();

/** Employee type — enum matching headcountEmployeeTypeEnum. */
export const employeeType = z.enum(["full_time", "part_time", "contractor"]);

/** Benefits rate — 0 to 200% (some roles have very high benefits). */
export const benefitsRate = z.number().min(0, "Benefits rate must be >= 0").max(2, "Benefits rate cannot exceed 200%").default(0.2);

/** ISO date string (YYYY-MM-DD or full ISO). */
export const dateString = z.string().min(1, "Date is required").refine(
  (v) => !isNaN(Date.parse(v)),
  "Invalid date format"
);

/** Optional date string. */
export const optionalDate = z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid date format").optional().nullable();

/** Month count — positive integer, bounded. */
export const monthCount = z.number().int().min(1, "Months must be >= 1").max(120, "Cannot forecast more than 10 years").default(12);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Sum all values in a StatementLineItem's values array. */
export function sumValues(values: Array<{ month: string; value: number }>): number {
  return values.reduce((sum, v) => sum + v.value, 0);
}

/** Get latest value from a MetricValue array. */
export function latest(arr: Array<{ month: string; value: number }> | undefined): number | null {
  if (!arr || arr.length === 0) return null;
  // Task 6.8: dark/gated metrics (cac with no acquisitionSpend, ltvCacRatio
  // inheriting it, ltv with non-positive churn, magicNumber with no prior-qtr
  // spend) arrive from the engine as non-finite (NaN/Infinity). The genui
  // metric_card/kpi_grid handlers and the analytics JSON payload read this raw,
  // so coerce non-finite to null (same convention as context.ts:metricValueAtMonth,
  // Phase 5 §5.6) — never surface "NaN" to the model.
  const v = arr[arr.length - 1]!.value;
  return Number.isFinite(v) ? v : null;
}

// ── Tool handler type ────────────────────────────────────────────────────────

export type ToolHandler = (input: Record<string, unknown>, context: ToolContext) => Promise<string>;

export interface CompanyToolContext extends ToolContext {
  companyId: string;
}

export function requireCompanyId(context: ToolContext): CompanyToolContext {
  if (!context.companyId) {
    throw new Error("Company ID is required for this operation.");
  }
  return context as CompanyToolContext;
}

