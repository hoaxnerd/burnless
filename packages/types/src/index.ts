// Core entity types for Burnless financial planning

// ── Auth & Users ──────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Company / Organization ────────────────────────────────────────────────────

export type CompanyStage =
  | "pre_seed"
  | "seed"
  | "series_a"
  | "series_b"
  | "series_c_plus"
  | "bootstrapped";

export type BusinessModel =
  | "saas"
  | "marketplace"
  | "ecommerce"
  | "services"
  | "hardware"
  | "other";

export interface Company {
  id: string;
  name: string;
  stage: CompanyStage;
  businessModel: BusinessModel;
  industry: string | null;
  foundedDate: Date | null;
  fiscalYearEnd: number; // month (1-12)
  currency: string; // ISO 4217
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Accounts (Chart of Accounts) ──────────────────────────────────────────────

export type AccountCategory =
  | "revenue"
  | "cogs"
  | "operating_expense"
  | "other_income"
  | "other_expense"
  | "asset"
  | "liability"
  | "equity";

export type AccountType =
  | "income"
  | "expense"
  | "asset"
  | "liability"
  | "equity";

export interface Account {
  id: string;
  companyId: string;
  name: string;
  type: AccountType;
  category: AccountCategory;
  parentId: string | null;
  isSystem: boolean; // system-generated vs user-created
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

// ── Transactions ──────────────────────────────────────────────────────────────

export type TransactionSource = "manual" | "import" | "integration" | "forecast";

export interface Transaction {
  id: string;
  companyId: string;
  accountId: string;
  date: Date;
  amount: number; // positive = debit, negative = credit for expense; reversed for revenue
  description: string | null;
  source: TransactionSource;
  externalId: string | null; // for dedup from integrations
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

export type ScenarioType = "base" | "best" | "worst" | "custom";

export interface Scenario {
  id: string;
  companyId: string;
  name: string;
  type: ScenarioType;
  isDefault: boolean;
  isBudget: boolean;
  budgetLockedAt: Date | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Forecast Lines ────────────────────────────────────────────────────────────

export type ForecastMethod =
  | "fixed"
  | "growth_rate"
  | "per_unit"
  | "percentage_of"
  | "custom_formula";

export interface ForecastLine {
  id: string;
  scenarioId: string;
  accountId: string;
  method: ForecastMethod;
  parameters: Record<string, unknown>; // method-specific params
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Forecast Values (monthly projections) ─────────────────────────────────────

export interface ForecastValue {
  id: string;
  forecastLineId: string;
  month: Date; // first of month
  amount: number;
  isOverride: boolean; // manually overridden value
  createdAt: Date;
}

// ── Headcount ─────────────────────────────────────────────────────────────────

export interface Department {
  id: string;
  companyId: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HeadcountPlan {
  id: string;
  scenarioId: string;
  departmentId: string;
  title: string; // job title
  count: number;
  salary: number; // annual
  startDate: Date;
  endDate: Date | null;
  benefitsRate: number; // percentage of salary
  createdAt: Date;
  updatedAt: Date;
}

// ── Revenue Model ─────────────────────────────────────────────────────────────

export interface RevenueStream {
  id: string;
  scenarioId: string;
  name: string;
  type: "subscription" | "one_time" | "usage_based" | "services";
  parameters: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ── Funding Rounds ────────────────────────────────────────────────────────────

export interface FundingRound {
  id: string;
  companyId: string;
  name: string;
  type: "pre_seed" | "seed" | "series_a" | "series_b" | "series_c_plus" | "debt" | "grant";
  amount: number;
  date: Date;
  preMoneyValuation: number | null;
  dilutionPercent: number | null;
  isProjected: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ── Dashboard / Metrics ───────────────────────────────────────────────────────

export interface Metric {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  formula: string | null; // custom formula expression
  isSystem: boolean;
  category: "financial" | "saas" | "growth" | "efficiency" | "custom";
  createdAt: Date;
  updatedAt: Date;
}

// ── Integrations ──────────────────────────────────────────────────────────────

export type IntegrationType =
  | "quickbooks"
  | "xero"
  | "freshbooks"
  | "plaid"
  | "mercury"
  | "gusto"
  | "stripe";

export type IntegrationStatus = "active" | "disconnected" | "error";

export interface Integration {
  id: string;
  companyId: string;
  type: IntegrationType;
  status: IntegrationStatus;
  lastSyncAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── AI Conversations ──────────────────────────────────────────────────────────

export interface AiConversation {
  id: string;
  companyId: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

// ── Company Membership ────────────────────────────────────────────────────────

export type MemberRole = "owner" | "admin" | "editor" | "viewer";

export interface CompanyMember {
  id: string;
  companyId: string;
  userId: string;
  role: MemberRole;
  createdAt: Date;
  updatedAt: Date;
}
