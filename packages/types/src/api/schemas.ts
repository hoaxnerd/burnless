import { z } from "zod";
import { positiveAmount, percentage, ratio, dateString, nullableDateString } from "./validators";

// ── Shared Enums (Zod + inferred TS types) ─────────────────────────────────

export const accountTypeEnum = z.enum(["income", "expense", "asset", "liability", "equity"]);
export const accountCategoryEnum = z.enum([
  "revenue", "cogs", "operating_expense", "other_income",
  "other_expense", "asset", "liability", "equity",
]);
/** @deprecated Use scenarioSourceEnum/scenarioStatusEnumZ instead */
export const scenarioTypeEnum = z.enum(["base", "best", "worst", "custom"]);
export const forecastMethodEnum = z.enum(["fixed", "growth_rate", "per_unit", "percentage_of", "custom_formula"]);
export const revenueStreamTypeEnum = z.enum([
  "subscription",
  "one_time",
  "usage_based",
  "services",
  "marketplace",
  "ecommerce",
  "hardware",
]);
export const fundingRoundTypeEnum = z.enum(["pre_seed", "seed", "series_a", "series_b", "series_c_plus", "debt", "grant"]);
export const integrationTypeEnum = z.enum(["quickbooks", "xero", "freshbooks", "plaid", "mercury", "gusto", "stripe"]);
export const aiProviderEnum = z.enum(["anthropic", "openai", "openrouter", "ollama"]);
export const aiDataModeEnum = z.enum(["full", "show_cached", "hide_all"]);
export const aiWriteModeEnum = z.enum(["full", "confirm", "read_only"]);

// ── Accounts ────────────────────────────────────────────────────────────────

export const createAccountSchema = z.object({
  name: z.string().min(1),
  type: accountTypeEnum,
  category: accountCategoryEnum,
  parentId: z.string().nullable().default(null),
  isSystem: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  type: accountTypeEnum.optional(),
  category: accountCategoryEnum.optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

// ── Departments ─────────────────────────────────────────────────────────────

export const createDepartmentSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().nullable().default(null),
});

export const updateDepartmentSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

// ── Scenarios ───────────────────────────────────────────────────────────────

export const scenarioSourceEnum = z.enum(["blank", "ai", "template", "clone", "backup"]);
export const scenarioStatusEnumZ = z.enum(["active", "promoted", "archived"]);

export const createScenarioSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().default(null),
  source: scenarioSourceEnum.default("blank"),
  color: z.string().nullable().default(null),
  sourceScenarioId: z.string().nullable().default(null),
});

export const updateScenarioSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  status: scenarioStatusEnumZ.optional(),
  autoDeleteAt: z.string().datetime().nullable().optional(),
});

export type CreateScenarioInput = z.infer<typeof createScenarioSchema>;
export type UpdateScenarioInput = z.infer<typeof updateScenarioSchema>;

// ── Headcount Plans ─────────────────────────────────────────────────────────

export const createHeadcountSchema = z.object({
  departmentId: z.string(),
  title: z.string().min(1),
  count: z.number().int().min(1).default(1),
  salary: positiveAmount(),
  startDate: dateString(),
  endDate: nullableDateString(),
  benefitsRate: ratio().default(0.20),
});

export const updateHeadcountSchema = z.object({
  departmentId: z.string().optional(),
  title: z.string().min(1).optional(),
  count: z.number().int().min(1).optional(),
  salary: positiveAmount().optional(),
  startDate: dateString().optional(),
  endDate: z.string().nullable().transform((s) => (s ? new Date(s) : null)).optional(),
  benefitsRate: ratio().optional(),
});

export type CreateHeadcountInput = z.infer<typeof createHeadcountSchema>;
export type UpdateHeadcountInput = z.infer<typeof updateHeadcountSchema>;

// ── Revenue Streams ─────────────────────────────────────────────────────────

export const createRevenueStreamSchema = z.object({
  name: z.string().min(1),
  type: revenueStreamTypeEnum.default("subscription"),
  startDate: z.string().date(),                       // ISO YYYY-MM-DD, required
  endDate: z.string().date().nullable().optional(),    // ISO YYYY-MM-DD or null
  parameters: z.record(z.unknown()).default({}),
});

export const updateRevenueStreamSchema = z.object({
  name: z.string().min(1).optional(),
  type: revenueStreamTypeEnum.optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().nullable().optional(),
  parameters: z.record(z.unknown()).optional(),
});

export type CreateRevenueStreamInput = z.infer<typeof createRevenueStreamSchema>;
export type UpdateRevenueStreamInput = z.infer<typeof updateRevenueStreamSchema>;

// ── Funding Rounds ──────────────────────────────────────────────────────────

export const createFundingRoundSchema = z.object({
  name: z.string().min(1),
  type: fundingRoundTypeEnum,
  amount: positiveAmount(),
  date: dateString(),
  preMoneyValuation: positiveAmount().nullable().default(null),
  dilutionPercent: percentage().nullable().default(null),
  isProjected: z.boolean().default(false),
});

export const updateFundingRoundSchema = z.object({
  name: z.string().min(1).optional(),
  type: fundingRoundTypeEnum.optional(),
  amount: positiveAmount().optional(),
  date: dateString().optional(),
  preMoneyValuation: positiveAmount().nullable().optional(),
  dilutionPercent: percentage().nullable().optional(),
  isProjected: z.boolean().optional(),
});

export type CreateFundingRoundInput = z.infer<typeof createFundingRoundSchema>;
export type UpdateFundingRoundInput = z.infer<typeof updateFundingRoundSchema>;

// ── Forecast Lines ──────────────────────────────────────────────────────────

export const createForecastLineSchema = z.object({
  accountId: z.string(),
  method: forecastMethodEnum.default("fixed"),
  parameters: z.record(z.unknown()).default({}),
  startDate: dateString(),
  endDate: nullableDateString(),
});

export const updateForecastLineSchema = z.object({
  method: forecastMethodEnum.optional(),
  parameters: z.record(z.unknown()).optional(),
  startDate: dateString().optional(),
  endDate: z.string().nullable().transform((s) => (s ? new Date(s) : null)).optional(),
});

export type CreateForecastLineInput = z.infer<typeof createForecastLineSchema>;
export type UpdateForecastLineInput = z.infer<typeof updateForecastLineSchema>;

// ── Integrations ────────────────────────────────────────────────────────────

export const createIntegrationSchema = z.object({
  type: integrationTypeEnum,
  metadata: z.record(z.unknown()).optional(),
});

export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>;

// ── AI Features ─────────────────────────────────────────────────────────────

export const updateAiFeaturesSchema = z.object({
  masterEnabled: z.boolean().optional(),
  dataMode: aiDataModeEnum.optional(),
  writeMode: aiWriteModeEnum.optional(),
  features: z
    .object({
      onboarding: z.boolean().optional(),
      chat: z.boolean().optional(),
      insights: z.boolean().optional(),
      uiPersonalization: z.boolean().optional(),
      autoCategorization: z.boolean().optional(),
    })
    .optional(),
  companionName: z.string().min(1).max(50).optional(),
  byokEnabled: z.boolean().optional(),
  aiProvider: aiProviderEnum.nullable().optional(),
  aiApiKey: z.string().max(256).nullable().optional(),
  aiModel: z.string().max(128).nullable().optional(),
  aiBaseUrl: z.string().url().max(512).nullable().optional(),
});

export type UpdateAiFeaturesInput = z.infer<typeof updateAiFeaturesSchema>;

// ── Invite Codes ────────────────────────────────────────────────────────────

export const inviteCodeTypeEnum = z.enum(["single_use", "multi_use"]);

export const createInviteCodeSchema = z.object({
  code: z.string().min(4).max(64).regex(/^[A-Za-z0-9_-]+$/, "Code must be alphanumeric (hyphens and underscores allowed)"),
  type: inviteCodeTypeEnum.default("single_use"),
  maxRedemptions: z.number().int().min(1).default(1),
  expiresAt: z.string().datetime().nullable().optional(),
  freePlatformDays: z.number().int().min(0).default(30),
  aiCreditsCents: z.number().int().min(0).default(5000),
  note: z.string().max(500).nullable().optional(),
});

export const updateInviteCodeSchema = z.object({
  isActive: z.boolean().optional(),
  maxRedemptions: z.number().int().min(1).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  freePlatformDays: z.number().int().min(0).optional(),
  aiCreditsCents: z.number().int().min(0).optional(),
  note: z.string().max(500).nullable().optional(),
});

export const redeemInviteCodeSchema = z.object({
  code: z.string().min(1),
});

export type CreateInviteCodeInput = z.infer<typeof createInviteCodeSchema>;
export type UpdateInviteCodeInput = z.infer<typeof updateInviteCodeSchema>;
export type RedeemInviteCodeInput = z.infer<typeof redeemInviteCodeSchema>;
