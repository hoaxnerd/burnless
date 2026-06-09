/**
 * Pure parsing helpers for onboarding data.
 * Extracted from the API route for testability.
 */

import { z } from "zod";

/**
 * ONB-02 — sane upper bounds for AI-enriched / user-edited financial inputs.
 *
 * The AI research agent (and a fat-fingered user) can emit absurd values
 * (e.g. 9.8B/mo monthly revenue) that ripple into engine runway/burn math and
 * the dashboard headlines. These are deliberately generous — they catch only
 * truly-impossible inputs, never a legitimately-large enterprise figure.
 *
 *   SANE_MAX_AMOUNT — money amounts (revenue/funding/expenses).
 *   SANE_MAX_COUNT  — counts (team_size, usage quantity). Usage-based revenue
 *                     can be high-volume, so this is kept generous.
 *   SANE_MAX_SALARY — a single role's annual salary.
 */
export const SANE_MAX_AMOUNT = 1e12;
export const SANE_MAX_COUNT = 1e5;
export const SANE_MAX_SALARY = 1e10;

/**
 * Refine a string money/count field so its PARSED numeric value is bounded.
 * The parser MUST match how the value is later consumed so the schema never
 * accepts a value the inserter then re-parses past the bound.
 */
const cappedNumericString = (max: number, parse: (s: string) => number) =>
  z.string().refine((s) => parse(s) <= max, {
    message: "This value looks unusually large — please double-check",
  });

export const onboardingSchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  stage: z.string().default("Pre-seed"),
  business_model: z.string().default("SaaS"),
  monthly_revenue: cappedNumericString(SANE_MAX_AMOUNT, parseMoneyAmount)
    .optional()
    .default("0"),
  team_size: cappedNumericString(SANE_MAX_COUNT, parseTeamSize)
    .optional()
    .default("1"),
  funding: cappedNumericString(SANE_MAX_AMOUNT, parseMoneyAmount)
    .optional()
    .default("0"),
  main_expenses: z.string().optional().default("General operations"),
  user_name: z.string().optional(),
  founders: z.array(z.string()).optional().default([]),
  funding_rounds: z.array(z.object({
    name: z.string(),
    type: z.enum(["pre_seed", "seed", "series_a", "series_b", "series_c_plus", "debt", "grant"]),
    amount: z.number().nonnegative().max(SANE_MAX_AMOUNT),
    date: z.string(),
    preMoneyValuation: z.number().nullable().optional(),
    dilutionPercent: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
  })).optional().default([]),
  headcount: z.array(z.object({
    title: z.string(),
    department: z.enum(["Engineering", "Sales", "Marketing", "Operations", "General & Admin"]),
    employeeType: z.enum(["full_time", "part_time", "contractor"]),
    salary: z.number().nonnegative().max(SANE_MAX_SALARY),
    startDate: z.string(),
  })).optional().default([]),
  expenses: z.array(z.object({
    name: z.string(),
    category: z.enum(["Cloud Infrastructure", "Marketing", "Office & Admin", "Software & Tools"]),
    amount: z.number().nonnegative().max(SANE_MAX_AMOUNT),
    startDate: z.string(),
    isRecurring: z.boolean(),
  })).optional().default([]),
  revenue_streams: z.array(z.object({
    name: z.string(),
    type: z.enum(["subscription", "one_time", "usage_based", "services", "marketplace", "ecommerce", "hardware"]),
    amount: z.number().nonnegative().max(SANE_MAX_AMOUNT),
    quantity: z.number().nonnegative().max(SANE_MAX_COUNT),
    startDate: z.string(),
    notes: z.string().nullable().optional(),
  })).optional().default([]),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

/** Map user-friendly stage names to enum values */
export function parseStage(
  input: string
): "pre_seed" | "seed" | "series_a" | "series_b" | "series_c_plus" | "bootstrapped" {
  const lower = input.toLowerCase();
  if (lower.includes("series b") || lower.includes("b+")) return "series_b";
  if (lower.includes("series a")) return "series_a";
  if (lower.includes("series c")) return "series_c_plus";
  if (lower.includes("seed") && !lower.includes("pre")) return "seed";
  if (lower.includes("pre")) return "pre_seed";
  if (lower.includes("bootstrap") || lower.includes("self")) return "bootstrapped";
  return "pre_seed";
}

export function parseBusinessModel(
  input: string
): "saas" | "marketplace" | "ecommerce" | "services" | "hardware" | "other" {
  const lower = input.toLowerCase();
  if (lower.includes("saas") || lower.includes("subscription")) return "saas";
  if (lower.includes("market")) return "marketplace";
  if (lower.includes("ecom") || lower.includes("e-com")) return "ecommerce";
  if (lower.includes("service") || lower.includes("consult") || lower.includes("agency"))
    return "services";
  if (lower.includes("hardware") || lower.includes("physical")) return "hardware";
  return "other";
}

export function parseMoneyAmount(input: string): number {
  if (!input) return 0;
  const lower = input.toLowerCase().replace(/[,$\s]/g, "");
  if (lower === "0") return 0;
  const match = lower.match(/(\d+\.?\d*)\s*(m|k|million|thousand)?/);
  if (!match) return 0;
  let amount = parseFloat(match[1]!);
  const suffix = match[2];
  if (suffix === "m" || suffix === "million") amount *= 1_000_000;
  else if (suffix === "k" || suffix === "thousand") amount *= 1_000;
  return Math.round(amount);
}

export function parseTeamSize(input: string): number {
  const match = input.match(/(\d+)/);
  return match ? parseInt(match[1]!, 10) : 1;
}
