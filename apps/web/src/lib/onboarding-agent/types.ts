/**
 * Shape of the company profile that the onboarding research agent must emit.
 *
 * The agent's freeform JSON is healed into this canonical shape by `heal.ts`
 * before it leaves the module — callers can rely on every enum being valid
 * and every numeric field being a real number (defaults applied when missing).
 */

export type FundingType =
  | "pre_seed"
  | "seed"
  | "series_a"
  | "series_b"
  | "series_c_plus"
  | "debt"
  | "grant";

export type Stage = "Pre-seed" | "Seed" | "Series A" | "Series B+" | "Bootstrapped";

export type BusinessModel =
  | "SaaS"
  | "Marketplace"
  | "E-commerce"
  | "Services"
  | "Hardware"
  | "Other";

export type Department =
  | "Engineering"
  | "Sales"
  | "Marketing"
  | "Operations"
  | "General & Admin";

export type EmployeeType = "full_time" | "part_time" | "contractor";

export type ExpenseCategory =
  | "Cloud Infrastructure"
  | "Marketing"
  | "Office & Admin"
  | "Software & Tools";

export type RevenueType =
  | "subscription"
  | "one_time"
  | "usage_based"
  | "services"
  | "marketplace"
  | "ecommerce"
  | "hardware";

export interface FundingRoundDraft {
  name: string;
  type: FundingType;
  amount: number;
  date: string; // ISO YYYY-MM-DD
  preMoneyValuation: number | null;
  dilutionPercent: number | null;
  notes?: string;
}

export interface HeadcountRoleDraft {
  title: string;
  department: Department;
  employeeType: EmployeeType;
  salary: number;
  startDate: string; // ISO YYYY-MM-DD
}

export interface ExpenseDraft {
  name: string;
  category: ExpenseCategory;
  amount: number;
  startDate: string; // ISO YYYY-MM-DD
  isRecurring: boolean;
}

export interface RevenueStreamDraft {
  name: string;
  type: RevenueType;
  amount: number; // pricing amount (per unit / month / hour depending on type)
  quantity: number; // customers, units, or hours per month
  startDate: string; // ISO YYYY-MM-DD
  notes?: string;
}

export interface OnboardingAgentResult {
  companyName: string;
  stage?: Stage;
  businessModel?: BusinessModel;
  industry?: string;
  founders: string[];
  fundingRounds: FundingRoundDraft[];
  headcount: HeadcountRoleDraft[];
  expenses: ExpenseDraft[];
  revenueStreams: RevenueStreamDraft[];
}
