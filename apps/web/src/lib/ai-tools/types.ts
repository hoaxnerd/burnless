/**
 * Shared types, Zod schemas, and helpers for AI tool modules.
 */

import { z } from "zod";

// ── Context ──────────────────────────────────────────────────────────────────

export interface ToolContext {
  companyId: string;
  scenarioId: string;
  userId: string;
  conversationId?: string;
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

/** Headcount — positive integer, bounded. */
export const headcount = z.number().int("Count must be a whole number").min(1, "Count must be >= 1").max(100_000, "Count exceeds 100,000 limit");

/** Salary — positive, bounded. */
export const salaryAmount = z.number().positive("Salary must be > 0").max(100_000_000, "Salary exceeds $100M limit");

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
  return arr[arr.length - 1]!.value;
}

// ── Tool handler type ────────────────────────────────────────────────────────

export type ToolHandler = (input: Record<string, unknown>, context: ToolContext) => Promise<string>;
