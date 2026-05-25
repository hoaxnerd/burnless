// API schemas (Zod) — shared request/response contracts
export * from "./api";

// Core entity types for Burnless financial planning

// ── Currency & Locale ────────────────────────────────────────────────────────

/** ISO 4217 currency codes we actively support. */
export type CurrencyCode = "USD" | "EUR" | "GBP" | "INR" | "CAD" | "AUD" | "SGD" | "AED" | "JPY" | "BRL";

/** Currency metadata for display and formatting. */
export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  /** Number of decimal places (0 for JPY, 2 for most). */
  decimals: number;
  /** Default locale for this currency (used when user has no preference). */
  defaultLocale: string;
}

/** All supported currencies with their metadata. */
export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  USD: { code: "USD", symbol: "$", name: "US Dollar", decimals: 2, defaultLocale: "en-US" },
  EUR: { code: "EUR", symbol: "€", name: "Euro", decimals: 2, defaultLocale: "de-DE" },
  GBP: { code: "GBP", symbol: "£", name: "British Pound", decimals: 2, defaultLocale: "en-GB" },
  INR: { code: "INR", symbol: "₹", name: "Indian Rupee", decimals: 2, defaultLocale: "en-IN" },
  CAD: { code: "CAD", symbol: "CA$", name: "Canadian Dollar", decimals: 2, defaultLocale: "en-CA" },
  AUD: { code: "AUD", symbol: "A$", name: "Australian Dollar", decimals: 2, defaultLocale: "en-AU" },
  SGD: { code: "SGD", symbol: "S$", name: "Singapore Dollar", decimals: 2, defaultLocale: "en-SG" },
  AED: { code: "AED", symbol: "د.إ", name: "UAE Dirham", decimals: 2, defaultLocale: "ar-AE" },
  JPY: { code: "JPY", symbol: "¥", name: "Japanese Yen", decimals: 0, defaultLocale: "ja-JP" },
  BRL: { code: "BRL", symbol: "R$", name: "Brazilian Real", decimals: 2, defaultLocale: "pt-BR" },
};

/** Runtime tuple of supported currency codes — use for Zod enum / iteration. */
export const CURRENCY_CODES = [
  "USD", "EUR", "GBP", "INR", "CAD", "AUD", "SGD", "AED", "JPY", "BRL",
] as const satisfies ReadonlyArray<CurrencyCode>;

/** Supported data residency regions. */
export type DataRegion = "us-east" | "eu-west" | "ap-south";

export const DATA_REGIONS: Record<DataRegion, { name: string; location: string }> = {
  "us-east": { name: "US East", location: "Virginia, USA" },
  "eu-west": { name: "EU West", location: "Frankfurt, Germany" },
  "ap-south": { name: "Asia Pacific", location: "Mumbai, India" },
};

/** Locale formatting preferences stored per-company. */
export interface LocaleSettings {
  /** BCP 47 locale tag for number/date formatting (e.g., "en-US", "en-IN"). */
  locale: string;
  /** Reporting currency ISO code. */
  currency: CurrencyCode;
  /** Timezone identifier (e.g., "America/New_York", "Asia/Kolkata"). */
  timezone: string;
  /** Data residency region. */
  region: DataRegion;
}

/** Default locale settings. */
export const DEFAULT_LOCALE_SETTINGS: LocaleSettings = {
  locale: "en-US",
  currency: "USD",
  timezone: "America/New_York",
  region: "us-east",
};

// ── Formatting Utilities (isomorphic — works in Node + browser) ─────────────

/**
 * Format a monetary amount using Intl.NumberFormat with the given currency and locale.
 * This is the single source of truth for currency formatting across the entire app.
 */
export function formatCurrency(
  amount: number,
  currency: CurrencyCode = "USD",
  locale?: string,
  options?: { compact?: boolean; decimals?: number }
): string {
  const resolvedLocale = locale || CURRENCIES[currency]?.defaultLocale || "en-US";
  const currencyConfig = CURRENCIES[currency];

  if (options?.compact) {
    return formatCompactAmount(amount, currency, resolvedLocale);
  }

  return new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency,
    minimumFractionDigits: options?.decimals ?? 0,
    maximumFractionDigits: options?.decimals ?? (currencyConfig?.decimals ?? 2),
  }).format(amount);
}

/**
 * Format a monetary amount in compact notation (e.g., "$1.2M", "₹10L", "€500k").
 * Respects Indian numbering system for INR.
 */
export function formatCompactAmount(
  amount: number,
  currency: CurrencyCode = "USD",
  locale?: string
): string {
  // [Phase 4 E Task 7] Guard: if a non-CurrencyCode value leaks in at runtime
  // (e.g. Recharts passing a tick index as the second arg), fall back to USD so
  // we never render a raw number as the currency symbol ("4120k" bug).
  const safeCurrency: CurrencyCode = CURRENCIES[currency] ? currency : "USD";
  const config = CURRENCIES[safeCurrency];
  const symbol = config.symbol;
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  const resolvedLocale = locale || config.defaultLocale || "en-US";

  // Indian numbering: lakhs and crores
  if (resolvedLocale === "en-IN" || safeCurrency === "INR") {
    if (abs >= 1_00_00_000) return `${sign}${symbol}${(abs / 1_00_00_000).toFixed(1)}Cr`;
    if (abs >= 1_00_000) return `${sign}${symbol}${(abs / 1_00_000).toFixed(1)}L`;
    if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(0)}k`;
    return `${sign}${symbol}${abs.toFixed(0)}`;
  }

  // Western numbering: millions and thousands
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(0)}k`;
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

/**
 * Format a number (non-currency) respecting locale.
 */
export function formatNumber(
  value: number,
  locale: string = "en-US",
  options?: { decimals?: number; compact?: boolean }
): string {
  if (options?.compact) {
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    // Indian numbering for Indian locales
    if (locale === "en-IN") {
      if (abs >= 1_00_00_000) return `${sign}${(abs / 1_00_00_000).toFixed(1)}Cr`;
      if (abs >= 1_00_000) return `${sign}${(abs / 1_00_000).toFixed(1)}L`;
      if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}k`;
      return `${sign}${abs.toFixed(0)}`;
    }
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}k`;
    return `${sign}${abs.toFixed(0)}`;
  }

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: options?.decimals ?? 0,
    maximumFractionDigits: options?.decimals ?? 0,
  }).format(value);
}

/**
 * Format a date respecting locale and timezone.
 */
export function formatDate(
  date: Date | string,
  locale: string = "en-US",
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(locale, options ?? { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Format a month key (YYYY-MM) to a locale-aware short month display.
 */
export function formatMonthKey(
  monthKey: string,
  locale: string = "en-US",
  options?: { includeYear?: boolean }
): string {
  const parts = monthKey.split("-");
  const year = Number(parts[0] ?? 2000);
  const month = Number(parts[1] ?? 1);
  const date = new Date(year, month - 1);
  const fmt: Intl.DateTimeFormatOptions = options?.includeYear
    ? { month: "short", year: "2-digit" }
    : { month: "short" };
  return date.toLocaleDateString(locale, fmt);
}

/**
 * Format a percentage value.
 */
export function formatPercent(
  value: number,
  locale: string = "en-US",
  decimals: number = 1
): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

/**
 * Get the currency symbol for a given currency code.
 */
export function getCurrencySymbol(currency: CurrencyCode): string {
  return CURRENCIES[currency]?.symbol ?? currency;
}

/**
 * Check if a string is a valid CurrencyCode.
 */
export function isValidCurrency(code: string): code is CurrencyCode {
  return code in CURRENCIES;
}

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
  currency: CurrencyCode; // ISO 4217
  locale: string; // BCP 47 locale tag
  timezone: string; // IANA timezone
  region: DataRegion; // data residency region
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

export type ScenarioSource = "blank" | "ai" | "template" | "clone" | "backup";
export type ScenarioStatus = "active" | "promoted" | "archived";

export interface Scenario {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  source: ScenarioSource;
  status: ScenarioStatus;
  color: string | null;
  sourceScenarioId: string | null;
  aiConversationId: string | null;
  promotedAt: Date | null;
  autoDeleteAt: Date | null;
  deletedAt: Date | null;
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
