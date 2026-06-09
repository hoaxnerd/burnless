import { z } from "zod";
import { positiveAmount, percentage, ratio, dateString, nullableDateString, withDateRange } from "./validators";

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
// FUND-03: set-equal to the DB pgEnum (`funding_round_type`) and engine `FundingRoundType` union — both already include safe + convertible. Guarded by funding-round-schema-parity.test.ts.
export const fundingRoundTypeEnum = z.enum(["pre_seed", "seed", "series_a", "series_b", "series_c_plus", "debt", "grant", "safe", "convertible"]);
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
  coversHeadcount: z.boolean().default(false),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  type: accountTypeEnum.optional(),
  category: accountCategoryEnum.optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  coversHeadcount: z.boolean().optional(),
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

export const headcountEmployeeTypeEnum = z.enum(["full_time", "part_time", "contractor"]);

export const createHeadcountSchema = withDateRange(
  z.object({
    departmentId: z.string(),
    title: z.string().min(1),
    name: z.string().nullable().optional(),
    employeeType: headcountEmployeeTypeEnum.default("full_time"),
    count: z.number().min(0).max(99.99).default(1),
    salary: positiveAmount(),
    hourlyRate: z.number().nonnegative().nullable().optional(),
    hoursPerWeek: z.number().min(0).max(168).nullable().optional(),
    startDate: dateString(),
    endDate: nullableDateString(),
    benefitsRate: ratio().default(0.20),
    parameters: z.record(z.unknown()).optional(),
  }),
);

export const updateHeadcountSchema = z.object({
  departmentId: z.string().optional(),
  title: z.string().min(1).optional(),
  name: z.string().nullable().optional(),
  employeeType: headcountEmployeeTypeEnum.optional(),
  count: z.number().min(0).max(99.99).optional(),
  salary: positiveAmount().optional(),
  hourlyRate: z.number().nonnegative().nullable().optional(),
  hoursPerWeek: z.number().min(0).max(168).nullable().optional(),
  startDate: dateString().optional(),
  endDate: z.string().nullable().transform((s) => (s ? new Date(s) : null)).optional(),
  benefitsRate: ratio().optional(),
  parameters: z.record(z.unknown()).optional(),
});

export type CreateHeadcountInput = z.infer<typeof createHeadcountSchema>;
export type UpdateHeadcountInput = z.infer<typeof updateHeadcountSchema>;

// ── Salary Changes ──────────────────────────────────────────────────────────

export const createSalaryChangeSchema = z.object({
  effectiveDate: dateString(),
  newSalary: positiveAmount(),
  reason: z.string().nullable().optional(),
});

export const updateSalaryChangeSchema = z.object({
  effectiveDate: dateString().optional(),
  newSalary: positiveAmount().optional(),
  reason: z.string().nullable().optional(),
});

export type CreateSalaryChangeInput = z.infer<typeof createSalaryChangeSchema>;
export type UpdateSalaryChangeInput = z.infer<typeof updateSalaryChangeSchema>;

// ── Bonuses ─────────────────────────────────────────────────────────────────

export const bonusTypeEnumZ = z.enum(["signing", "performance", "retention", "other"]);

export const createBonusSchema = z.object({
  payoutMonth: dateString(),
  amount: positiveAmount(),
  type: bonusTypeEnumZ.default("performance"),
  notes: z.string().nullable().optional(),
});

export const updateBonusSchema = z.object({
  payoutMonth: dateString().optional(),
  amount: positiveAmount().optional(),
  type: bonusTypeEnumZ.optional(),
  notes: z.string().nullable().optional(),
});

export type CreateBonusInput = z.infer<typeof createBonusSchema>;
export type UpdateBonusInput = z.infer<typeof updateBonusSchema>;

// ── Equity Grants ───────────────────────────────────────────────────────────

export const equityGrantTypeEnumZ = z.enum(["iso", "nso", "rsu"]);

const vestingMilestoneSchema = z.object({
  type: z.enum(["cliff", "monthly", "quarterly", "annual", "milestone"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sharesVested: z.number().nonnegative(),
});

export const createEquityGrantSchema = z.object({
  grantDate: dateString(),
  shares: z.number().positive(),
  strikePrice: z.number().nonnegative().nullable().optional(),
  grantType: equityGrantTypeEnumZ.default("iso"),
  parameters: z
    .object({
      vestingSchedule: z.array(vestingMilestoneSchema).default([]),
    })
    .passthrough()
    .optional(),
});

export const updateEquityGrantSchema = z.object({
  grantDate: dateString().optional(),
  shares: z.number().positive().optional(),
  strikePrice: z.number().nonnegative().nullable().optional(),
  grantType: equityGrantTypeEnumZ.optional(),
  parameters: z
    .object({
      vestingSchedule: z.array(vestingMilestoneSchema).optional(),
    })
    .passthrough()
    .optional(),
});

export type CreateEquityGrantInput = z.infer<typeof createEquityGrantSchema>;
export type UpdateEquityGrantInput = z.infer<typeof updateEquityGrantSchema>;

// ── Revenue Streams ─────────────────────────────────────────────────────────

export const createRevenueStreamSchema = withDateRange(
  z.object({
    name: z.string().min(1),
    type: revenueStreamTypeEnum.default("subscription"),
    startDate: z.string().date(),                       // ISO YYYY-MM-DD, required
    endDate: z.string().date().nullable().optional(),    // ISO YYYY-MM-DD or null
    parameters: z.record(z.unknown()).default({}),
  }),
);

export const updateRevenueStreamSchema = withDateRange(
  z.object({
    name: z.string().min(1).optional(),
    type: revenueStreamTypeEnum.optional(),
    startDate: z.string().date().optional(),
    endDate: z.string().date().nullable().optional(),
    parameters: z.record(z.unknown()).optional(),
  }),
);

export type CreateRevenueStreamInput = z.infer<typeof createRevenueStreamSchema>;
export type UpdateRevenueStreamInput = z.infer<typeof updateRevenueStreamSchema>;

// ── Funding Rounds ──────────────────────────────────────────────────────────

export const createFundingRoundSchema = z.object({
  name: z.string().min(1),
  // FUND-01: the Add form sends `roundType` (matches the AI tool + DB intent); the
  // POST route maps roundType -> the DB `type` column. Renamed from `type` (which
  // 400'd every create). roundType is immutable post-creation (omitted from update).
  roundType: fundingRoundTypeEnum,
  amount: positiveAmount(),
  date: dateString(),
  preMoneyValuation: positiveAmount().nullable().default(null),
  dilutionPercent: percentage().nullable().default(null),
  isProjected: z.boolean().default(false),
  // FUND-04: type-specific data + close/notes were silently stripped on create
  // (present on update only). Mirror updateFundingRoundSchema so they persist.
  closeDate: nullableDateString(),
  notes: z.string().nullable().optional(),
  parameters: z.record(z.unknown()).optional(),
});

export const updateFundingRoundSchema = z.object({
  name: z.string().min(1).optional(),
  // NOTE: `type`/`roundType` are intentionally omitted — they are immutable
  // post-creation. The route-level peek-strip enforces this with a 400 before
  // Zod ever runs; omitting them here keeps the schema in sync with intent.
  amount: positiveAmount().optional(),
  date: dateString().optional(),
  preMoneyValuation: positiveAmount().nullable().optional(),
  dilutionPercent: percentage().nullable().optional(),
  isProjected: z.boolean().optional(),
  // Phase 2 D fields — were previously silently dropped by Zod strip.
  closeDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  parameters: z.record(z.unknown()).optional(),
});

export type CreateFundingRoundInput = z.infer<typeof createFundingRoundSchema>;
export type UpdateFundingRoundInput = z.infer<typeof updateFundingRoundSchema>;

// ── Forecast Lines ──────────────────────────────────────────────────────────

/** Phase 1 §1.5 expense frequency enum (mirrors `expenseFrequencyEnum` in db schema). */
export const expenseFrequencyEnum = z.enum(["monthly", "quarterly", "annual"]);

export const createForecastLineSchema = withDateRange(
  z.object({
    accountId: z.string(),
    method: forecastMethodEnum.default("fixed"),
    parameters: z.record(z.unknown()).default({}),
    startDate: dateString(),
    endDate: nullableDateString(),
    // ── Phase 1 §1.5 / §2.C additions ───────────────────────────────────────
    notes: z.string().nullable().optional(),
    vendor: z.string().nullable().optional(),
    // Explicit per-line category override (set in the expense form). string = set,
    // null = clear (derive automatically), undefined = leave as-is.
    subcategory: z.string().trim().min(1).max(100).nullable().optional(),
    departmentId: z.string().nullable().optional(),
    frequency: expenseFrequencyEnum.default("monthly"),
    isOneTime: z.boolean().default(false),
    // Tri-state: true | false | null (cleared) | undefined (untouched).
    isRecurring: z.boolean().nullable().optional(),
  }),
);

export const updateForecastLineSchema = z.object({
  method: forecastMethodEnum.optional(),
  parameters: z.record(z.unknown()).optional(),
  startDate: dateString().optional(),
  endDate: z.string().nullable().transform((s) => (s ? new Date(s) : null)).optional(),
  // ── Phase 1 §1.5 / §2.C additions ───────────────────────────────────────
  notes: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  // Explicit per-line category override (set in the expense form). string = set,
  // null = clear (derive automatically), undefined = leave as-is.
  subcategory: z.string().trim().min(1).max(100).nullable().optional(),
  departmentId: z.string().nullable().optional(),
  frequency: expenseFrequencyEnum.optional(),
  isOneTime: z.boolean().optional(),
  // Tri-state: explicit `null` clears the column back to NULL.
  isRecurring: z.boolean().nullable().optional(),
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
