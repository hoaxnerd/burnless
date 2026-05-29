import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const companyStageEnum = pgEnum("company_stage", [
  "pre_seed",
  "seed",
  "series_a",
  "series_b",
  "series_c_plus",
  "bootstrapped",
]);

export const businessModelEnum = pgEnum("business_model", [
  "saas",
  "marketplace",
  "ecommerce",
  "services",
  "hardware",
  "other",
]);

export const accountTypeEnum = pgEnum("account_type", [
  "income",
  "expense",
  "asset",
  "liability",
  "equity",
]);

export const accountCategoryEnum = pgEnum("account_category", [
  "revenue",
  "cogs",
  "operating_expense",
  "other_income",
  "other_expense",
  "asset",
  "liability",
  "equity",
]);

export const transactionSourceEnum = pgEnum("transaction_source", [
  "manual",
  "import",
  "integration",
  "forecast",
]);

export const scenarioSourceEnum = pgEnum("scenario_source", [
  "blank",
  "ai",
  "template",
  "clone",
  "backup",
]);

export const scenarioStatusEnum = pgEnum("scenario_status", [
  "active",
  "promoted",
  "archived",
]);

export const scenarioOverrideActionEnum = pgEnum("scenario_override_action", [
  "create",
  "modify",
  "delete",
]);

export const forecastMethodEnum = pgEnum("forecast_method", [
  "fixed",
  "growth_rate",
  "per_unit",
  "percentage_of",
  "custom_formula",
]);

export const expenseFrequencyEnum = pgEnum("expense_frequency", [
  "monthly",
  "quarterly",
  "annual",
]);

export const memberRoleEnum = pgEnum("member_role", [
  "owner",
  "admin",
  "editor",
  "viewer",
]);

export const integrationTypeEnum = pgEnum("integration_type", [
  "quickbooks",
  "xero",
  "freshbooks",
  "plaid",
  "mercury",
  "gusto",
  "stripe",
]);

export const integrationStatusEnum = pgEnum("integration_status", [
  "active",
  "disconnected",
  "error",
]);

export const fundingRoundTypeEnum = pgEnum("funding_round_type", [
  "pre_seed",
  "seed",
  "series_a",
  "series_b",
  "series_c_plus",
  "debt",
  "grant",
  "safe",
  "convertible",
]);

export const revenueStreamTypeEnum = pgEnum("revenue_stream_type", [
  "subscription",
  "one_time",
  "usage_based",
  "services",
  "marketplace",
  "ecommerce",
  "hardware",
]);

export const metricCategoryEnum = pgEnum("metric_category", [
  "financial",
  "saas",
  "growth",
  "efficiency",
  "custom",
]);

export const aiMessageRoleEnum = pgEnum("ai_message_role", [
  "user",
  "assistant",
  "system",
]);

export const aiDataModeEnum = pgEnum("ai_data_mode", [
  "full",
  "show_cached",
  "hide_all",
]);

export const aiWriteModeEnum = pgEnum("ai_write_mode", [
  "full",
  "confirm",
  "read_only",
]);

export const aiPermissionModeEnum = pgEnum("ai_permission_mode", [
  "ask",
  "session",
  "always",
]);

export const aiToolPermissionDecisionEnum = pgEnum("ai_tool_permission_decision", [
  "auto",
  "granted_once",
  "granted_session",
  "denied",
]);

export const headcountEmployeeTypeEnum = pgEnum("headcount_employee_type", [
  "full_time",
  "part_time",
  "contractor",
]);

// ── Auth Tables (Auth.js compatible) ──────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  twoFactorSecret: text("two_factor_secret"),
  twoFactorBackupCodes: text("two_factor_backup_codes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
    index("accounts_user_idx").on(table.userId),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => [
    index("sessions_user_idx").on(table.userId),
  ]
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.identifier, table.token] }),
  ]
);

// ── Business Entities ─────────────────────────────────────────────────────────

export const dataRegionEnum = pgEnum("data_region", [
  "us-east",
  "eu-west",
  "ap-south",
]);

export const companies = pgTable("companies", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  stage: companyStageEnum("stage").notNull().default("pre_seed"),
  businessModel: businessModelEnum("business_model").notNull().default("saas"),
  industry: text("industry"),
  foundedDate: timestamp("founded_date", { mode: "date" }),
  fiscalYearEnd: integer("fiscal_year_end").notNull().default(12),
  currency: text("currency").notNull().default("USD"),
  locale: text("locale").notNull().default("en-US"),
  timezone: text("timezone").notNull().default("America/New_York"),
  region: dataRegionEnum("region").notNull().default("us-east"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  billingProvider: text("billing_provider"),
  billingCustomerId: text("billing_customer_id"),
  billingSubscriptionId: text("billing_subscription_id"),
  billingPlan: text("billing_plan").default("free"),
  benefitsRates: jsonb("benefits_rates").notNull().default({}),
  foundersOwnershipPercent: numeric("founders_ownership_percent", { precision: 7, scale: 4 })
    .notNull()
    .default("100.0000"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const companyMembers = pgTable(
  "company_members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("company_member_unique").on(table.companyId, table.userId),
    index("company_member_user_idx").on(table.userId),
  ]
);

export const departments = pgTable(
  "departments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("departments_company_idx").on(table.companyId),
  ]
);

// ── Chart of Accounts ─────────────────────────────────────────────────────────

export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
    category: accountCategoryEnum("category").notNull(),
    parentId: text("parent_id"),
    isSystem: boolean("is_system").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("financial_accounts_company_idx").on(table.companyId),
    index("financial_accounts_parent_idx").on(table.parentId),
  ]
);

// ── Transactions ──────────────────────────────────────────────────────────────

export const transactions = pgTable(
  "transactions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    date: timestamp("date", { mode: "date" }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    description: text("description"),
    vendor: text("vendor"),
    notes: text("notes"),
    source: transactionSourceEnum("source").notNull().default("manual"),
    externalId: text("external_id"),
    importBatchId: text("import_batch_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("transactions_company_date_idx").on(table.companyId, table.date),
    index("transactions_account_idx").on(table.accountId),
    uniqueIndex("transactions_external_id_idx").on(
      table.companyId,
      table.externalId
    ),
    index("transactions_batch_idx").on(table.importBatchId),
  ]
);

// ── Import Batches ───────────────────────────────────────────────────────────

export const importBatchStatusEnum = pgEnum("import_batch_status", [
  "pending",
  "processing",
  "completed",
  "rolled_back",
  "failed",
]);

export const importBatches = pgTable(
  "import_batches",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    status: importBatchStatusEnum("status").notNull().default("pending"),
    totalRows: integer("total_rows").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    accountId: text("account_id").references(() => financialAccounts.id),
    columnMapping: jsonb("column_mapping"),
    errors: jsonb("errors"),
    metadata: jsonb("metadata"),
    rolledBackAt: timestamp("rolled_back_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("import_batches_company_idx").on(table.companyId),
    index("import_batches_account_idx").on(table.accountId),
  ]
);

// ── Scenarios & Forecasts ─────────────────────────────────────────────────────

export const scenarios = pgTable(
  "scenarios",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    source: scenarioSourceEnum("source").notNull().default("blank"),
    status: scenarioStatusEnum("status").notNull().default("active"),
    color: text("color"),
    sourceScenarioId: text("source_scenario_id"),
    aiConversationId: text("ai_conversation_id"),
    promotedAt: timestamp("promoted_at", { mode: "date" }),
    autoDeleteAt: timestamp("auto_delete_at", { mode: "date" }),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("scenarios_company_idx").on(table.companyId),
  ]
);

export const scenarioOverrides = pgTable(
  "scenario_overrides",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarios.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: scenarioOverrideActionEnum("action").notNull(),
    data: jsonb("data"),
    originalData: jsonb("original_data"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("scenario_overrides_unique").on(table.scenarioId, table.entityType, table.entityId),
    index("scenario_overrides_scenario_type").on(table.scenarioId, table.entityType),
  ]
);

export const forecastLines = pgTable(
  "forecast_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    method: forecastMethodEnum("method").notNull().default("fixed"),
    parameters: jsonb("parameters").notNull().default({}),
    startDate: timestamp("start_date", { mode: "date" }).notNull(),
    endDate: timestamp("end_date", { mode: "date" }),
    // ── Phase 1 additions (§2.C) ─────────────────────────────────────────
    notes: text("notes"),
    vendor: text("vendor"),
    departmentId: text("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    frequency: expenseFrequencyEnum("frequency").notNull().default("monthly"),
    isOneTime: boolean("is_one_time").notNull().default(false),
    /**
     * Tri-state recurring flag (Phase 1 §1.5 anomaly refactor).
     * NULL = user has not declared; UI shows suggestion based on variance.
     * true/false = explicit user choice.
     */
    isRecurring: boolean("is_recurring"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("forecast_lines_company_idx").on(table.companyId),
    // Non-unique: Phase 1 consolidated form treats each forecast line as an
    // independent expense (vendor / notes / department / frequency / isOneTime),
    // so multiple lines per account are expected.
    index("forecast_lines_company_account_idx").on(
      table.companyId,
      table.accountId
    ),
    index("forecast_lines_company_department_idx").on(
      table.companyId,
      table.departmentId
    ),
    index("forecast_lines_vendor_idx").on(table.companyId, table.vendor),
  ]
);

export const forecastValues = pgTable(
  "forecast_values",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    forecastLineId: text("forecast_line_id")
      .notNull()
      .references(() => forecastLines.id, { onDelete: "cascade" }),
    month: timestamp("month", { mode: "date" }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    isOverride: boolean("is_override").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("forecast_values_line_idx").on(table.forecastLineId),
    index("forecast_values_month_idx").on(table.month),
    uniqueIndex("forecast_values_line_month_idx").on(
      table.forecastLineId,
      table.month
    ),
  ]
);

// ── Headcount Planning ────────────────────────────────────────────────────────

export const headcountPlans = pgTable(
  "headcount_plans",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Categories granted "for session" in this conversation, e.g. { write: true }. */
    sessionGrants: jsonb("session_grants")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    name: text("name"),
    employeeType: headcountEmployeeTypeEnum("employee_type")
      .notNull()
      .default("full_time"),
    count: numeric("count", { precision: 5, scale: 2 })
      .notNull()
      .default("1.00"),
    salary: numeric("salary", { precision: 12, scale: 2 }).notNull(),
    hourlyRate: numeric("hourly_rate", { precision: 12, scale: 2 }),
    hoursPerWeek: numeric("hours_per_week", { precision: 5, scale: 2 }),
    startDate: timestamp("start_date", { mode: "date" }).notNull(),
    endDate: timestamp("end_date", { mode: "date" }),
    benefitsRate: numeric("benefits_rate", { precision: 5, scale: 4 })
      .notNull()
      .default("0.20"),
    parameters: jsonb("parameters").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("headcount_plans_company_idx").on(table.companyId),
    index("headcount_plans_department_idx").on(table.departmentId),
  ]
);

// ── Equity Grants ─────────────────────────────────────────────────────────────

export const equityGrantTypeEnum = pgEnum("equity_grant_type", [
  "iso",
  "nso",
  "rsu",
]);

export const equityGrants = pgTable(
  "equity_grants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    headcountId: text("headcount_id")
      .notNull()
      .references(() => headcountPlans.id, { onDelete: "cascade" }),
    grantDate: timestamp("grant_date", { mode: "date" }).notNull(),
    shares: numeric("shares", { precision: 18, scale: 4 }).notNull(),
    strikePrice: numeric("strike_price", { precision: 18, scale: 4 }),
    grantType: equityGrantTypeEnum("grant_type").notNull().default("iso"),
    parameters: jsonb("parameters").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("equity_grants_company_idx").on(table.companyId),
    index("equity_grants_headcount_idx").on(table.headcountId),
  ]
);

// ── Bonuses ───────────────────────────────────────────────────────────────────

export const bonusTypeEnum = pgEnum("bonus_type", [
  "signing",
  "performance",
  "retention",
  "other",
]);

export const bonuses = pgTable(
  "bonuses",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    headcountId: text("headcount_id")
      .notNull()
      .references(() => headcountPlans.id, { onDelete: "cascade" }),
    payoutMonth: timestamp("payout_month", { mode: "date" }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    type: bonusTypeEnum("type").notNull().default("performance"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("bonuses_company_idx").on(table.companyId),
    index("bonuses_headcount_month_idx").on(
      table.headcountId,
      table.payoutMonth
    ),
  ]
);

// ── Salary Changes ────────────────────────────────────────────────────────────

export const salaryChanges = pgTable(
  "salary_changes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    headcountId: text("headcount_id")
      .notNull()
      .references(() => headcountPlans.id, { onDelete: "cascade" }),
    effectiveDate: timestamp("effective_date", { mode: "date" }).notNull(),
    newSalary: numeric("new_salary", { precision: 12, scale: 2 }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("salary_changes_company_idx").on(table.companyId),
    index("salary_changes_headcount_date_idx").on(
      table.headcountId,
      table.effectiveDate
    ),
  ]
);

// ── Revenue Streams ───────────────────────────────────────────────────────────

export const revenueStreams = pgTable(
  "revenue_streams",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: revenueStreamTypeEnum("type").notNull().default("subscription"),
    parameters: jsonb("parameters").notNull().default({}),
    startDate: timestamp("start_date", { mode: "date" }).notNull().defaultNow(),
    endDate: timestamp("end_date", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("revenue_streams_company_idx").on(table.companyId),
    index("revenue_streams_active_idx").on(table.companyId, table.startDate, table.endDate),
  ]
);

// ── Funding Rounds ────────────────────────────────────────────────────────────

export const fundingRounds = pgTable(
  "funding_rounds",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: fundingRoundTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    date: timestamp("date", { mode: "date" }).notNull(),
    preMoneyValuation: numeric("pre_money_valuation", {
      precision: 18,
      scale: 2,
    }),
    dilutionPercent: numeric("dilution_percent", { precision: 7, scale: 4 }),
    isProjected: boolean("is_projected").notNull().default(false),
    closeDate: timestamp("close_date", { mode: "date" }),
    notes: text("notes"),
    parameters: jsonb("parameters").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("funding_rounds_company_idx").on(table.companyId),
  ]
);

export const fundingRoundInvestors = pgTable(
  "funding_round_investors",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    fundingRoundId: text("funding_round_id")
      .notNull()
      .references(() => fundingRounds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    amountInvested: numeric("amount_invested", { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("funding_round_investors_round_idx").on(table.fundingRoundId),
  ],
);

export const shareClasses = pgTable(
  "share_classes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    totalAuthorized: numeric("total_authorized", { precision: 18, scale: 0 }).notNull(),
    totalIssued: numeric("total_issued", { precision: 18, scale: 0 }).notNull().default("0"),
    parValue: numeric("par_value", { precision: 18, scale: 6 }).notNull().default("0.000001"),
    liquidationPreference: numeric("liquidation_preference", {
      precision: 7,
      scale: 4,
    }).notNull().default("1.0000"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [index("share_classes_company_idx").on(table.companyId)],
);

export const optionPools = pgTable(
  "option_pools",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    totalReserved: numeric("total_reserved", { precision: 18, scale: 0 }).notNull(),
    refreshDate: timestamp("refresh_date", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [index("option_pools_company_idx").on(table.companyId)],
);

// ── Metrics ───────────────────────────────────────────────────────────────────

export const metrics = pgTable(
  "metrics",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    formula: text("formula"),
    isSystem: boolean("is_system").notNull().default(false),
    category: metricCategoryEnum("category").notNull().default("financial"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("metrics_company_slug_idx").on(table.companyId, table.slug),
  ]
);

// ── Integrations ──────────────────────────────────────────────────────────────

export const integrations = pgTable(
  "integrations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    type: integrationTypeEnum("type").notNull(),
    status: integrationStatusEnum("status").notNull().default("active"),
    lastSyncAt: timestamp("last_sync_at", { mode: "date" }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("integrations_company_type_idx").on(
      table.companyId,
      table.type
    ),
  ]
);

// ── AI Feature Flags ─────────────────────────────────────────────────────────

export const aiFeatureFlags = pgTable(
  "ai_feature_flags",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    masterEnabled: boolean("master_enabled").notNull().default(true),
    dataMode: aiDataModeEnum("data_mode").notNull().default("full"),
    monthlyBudgetCents: integer("monthly_budget_cents").notNull().default(5000), // $50 default
    features: jsonb("features")
      .notNull()
      .default({
        onboarding: true,
        chat: true,
        insights: true,
        uiPersonalization: true,
        autoCategorization: true,
        weeklyDigest: true,
      }),
    // AI write mode — guardrail for AI mutations (full = execute, confirm = ask first, read_only = block)
    writeMode: aiWriteModeEnum("write_mode").notNull().default("full"),
    // Configurable companion name (default: "Companion")
    companionName: text("companion_name").notNull().default("Companion"),
    // BYOK (Bring Your Own Key) — when false, platform LLM is used; when true, company's own provider config is used
    byokEnabled: boolean("byok_enabled").notNull().default(false),
    // AI Provider config — per-company provider override (null = use env vars)
    aiProvider: text("ai_provider"), // "anthropic" | "openai" | "openrouter"
    aiApiKey: text("ai_api_key"), // user's own API key (masked in API responses)
    aiModel: text("ai_model"), // custom model override
    aiBaseUrl: text("ai_base_url"), // custom base URL (e.g., OpenRouter endpoint)
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("ai_feature_flags_company_idx").on(table.companyId),
  ]
);

// ── AI Conversations ──────────────────────────────────────────────────────────

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    /** Categories granted "for session" in this conversation, e.g. { write: true }. */
    sessionGrants: jsonb("session_grants")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("ai_conversations_company_idx").on(table.companyId),
    index("ai_conversations_company_user_idx").on(table.companyId, table.userId),
  ]
);

// ── AI Insight Invalidations (mutation-driven regeneration queue) ────────────

export const insightInvalidations = pgTable(
  "insight_invalidations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    insightType: text("insight_type").notNull(), // dashboard | revenue | expense | scenario
    mutationSource: text("mutation_source").notNull(), // which data changed: expenses, revenue, headcount, funding, scenarios, accounts
    firstInvalidatedAt: timestamp("first_invalidated_at", { mode: "date" }).defaultNow().notNull(),
    lastMutationAt: timestamp("last_mutation_at", { mode: "date" }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("insight_invalidations_company_type_idx").on(
      table.companyId,
      table.insightType
    ),
    index("insight_invalidations_pending_idx").on(table.processedAt),
  ]
);

// ── AI Insight Cache ─────────────────────────────────────────────────────────

export const aiInsightCacheTypeEnum = pgEnum("ai_insight_cache_type", [
  "dashboard",
  "revenue",
  "expense",
  "scenario",
  "funding",
  "team",
  "reports",
  "general",
]);

export const aiInsightCache = pgTable(
  "ai_insight_cache",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    type: aiInsightCacheTypeEnum("type").notNull(),
    key: text("key").notNull(),
    content: jsonb("content").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    staleAt: timestamp("stale_at", { mode: "date" }),
    staleReason: text("stale_reason"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("ai_insight_cache_company_idx").on(table.companyId),
    uniqueIndex("ai_insight_cache_company_key_idx").on(
      table.companyId,
      table.type,
      table.key
    ),
  ]
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: aiMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("ai_messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
  ]
);

// ── AI Pending Actions (a paused assistant turn awaiting permission) ─────────

export const aiPendingActions = pgTable(
  "ai_pending_actions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    /** Correlates the SSE permission_request/paused event with this row. */
    pauseId: text("pause_id").notNull(),
    /**
     * The active scenario the paused turn operates in. Resume MUST run approved
     * write/delete tools against THIS scenario (loaded scoped to companyId), not
     * getDefaultScenario — otherwise a pause inside a non-default scenario writes
     * overrides to the wrong overlay (scenario-safety; spec §5).
     */
    scenarioId: text("scenario_id").notNull(),
    /** Raw assistant tool-use content blocks for the paused turn. */
    assistantBlocks: jsonb("assistant_blocks").notNull(),
    /** tool_result blocks for tools already executed (auto-allowed/denied). */
    completedResults: jsonb("completed_results").notNull().default([]),
    /** Actions awaiting a user decision: [{ requestId, tool, category, ... }]. */
    pending: jsonb("pending").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { mode: "date" }),
  },
  (table) => [
    index("ai_pending_actions_conversation_idx").on(table.conversationId),
    // At most one UNRESOLVED pending batch per conversation.
    uniqueIndex("ai_pending_actions_active_idx")
      .on(table.conversationId)
      .where(sql`${table.resolvedAt} IS NULL`),
  ]
);

// ── Dashboard Preferences (per-user layout, mode, card customization) ────────

export const dashboardModeEnum = pgEnum("dashboard_mode", [
  "intelligence",
  "dynamic",
  "custom",
]);

export const dashboardPreferences = pgTable(
  "dashboard_preferences",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** Global dashboard display mode */
    mode: dashboardModeEnum("mode").notNull().default("dynamic"),
    /** Ordered list of hero card metric slugs (4 cards) */
    heroCards: jsonb("hero_cards").$type<string[]>().notNull().default([]),
    /** Ordered list of secondary metric slugs */
    secondaryMetrics: jsonb("secondary_metrics").$type<string[]>().notNull().default([]),
    /** Per-card mode overrides: { [metricSlug]: "intelligence" | "dynamic" | "custom" } */
    cardModeOverrides: jsonb("card_mode_overrides")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    /** Per-card scenario overrides: { [metricSlug]: scenarioId } */
    cardScenarioOverrides: jsonb("card_scenario_overrides")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    /** Custom slug overrides: { "pageId:originalSlug": "newSlug" } — card slot → displayed metric */
    customSlugOverrides: jsonb("custom_slug_overrides")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    /** Typed slot content overrides: { "pageId:slotId": { type, slug?, ... } } */
    slotOverrides: jsonb("slot_overrides")
      .$type<Record<string, { type: string; slug?: string; chartId?: string; config?: Record<string, unknown> }>>()
      .notNull()
      .default({}),
    /** Dashboard widget layout: ordered list of { widgetId, w, h } */
    layout: jsonb("layout")
      .$type<
        Array<{
          widgetId: string;
          w: number;
          h: number;
        }>
      >()
      .notNull()
      .default([]),
    /** User-defined custom metric formulas: [{ id, name, formula, dependsOn }] */
    customMetrics: jsonb("custom_metrics")
      .$type<
        Array<{
          id: string;
          name: string;
          formula: string;
          dependsOn: string[];
        }>
      >()
      .notNull()
      .default([]),
    /** Widget IDs the user has explicitly closed/hidden */
    closedWidgets: jsonb("closed_widgets").$type<string[]>().notNull().default([]),
    /** Per-page layout overrides: { [pageId]: { layout: [...], closedWidgets: [...] } } */
    pageLayouts: jsonb("page_layouts")
      .$type<
        Record<
          string,
          {
            layout: Array<{
              widgetId: string;
              x?: number;
              y?: number;
              w: number;
              h: number;
              autoH?: boolean;
            }>;
            closedWidgets?: string[];
          }
        >
      >()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("dashboard_prefs_user_company_idx").on(table.userId, table.companyId),
  ]
);

// ── Relations ─────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  companyMemberships: many(companyMembers),
  ownedCompanies: many(companies),
  dashboardPreferences: many(dashboardPreferences),
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  owner: one(users, {
    fields: [companies.ownerId],
    references: [users.id],
  }),
  members: many(companyMembers),
  financialAccounts: many(financialAccounts),
  transactions: many(transactions),
  scenarios: many(scenarios),
  forecastLines: many(forecastLines),
  headcountPlans: many(headcountPlans),
  revenueStreams: many(revenueStreams),
  departments: many(departments),
  fundingRounds: many(fundingRounds),
  metrics: many(metrics),
  integrations: many(integrations),
  importBatches: many(importBatches),
  aiFeatureFlags: many(aiFeatureFlags),
  aiConversations: many(aiConversations),
  aiInsightCache: many(aiInsightCache),
  weeklyDigests: many(weeklyDigests),
  financialAuditLogs: many(financialAuditLogs),
  dashboardPreferences: many(dashboardPreferences),
}));

export const dashboardPreferencesRelations = relations(dashboardPreferences, ({ one }) => ({
  user: one(users, {
    fields: [dashboardPreferences.userId],
    references: [users.id],
  }),
  company: one(companies, {
    fields: [dashboardPreferences.companyId],
    references: [companies.id],
  }),
}));

export const companyMembersRelations = relations(companyMembers, ({ one }) => ({
  company: one(companies, {
    fields: [companyMembers.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [companyMembers.userId],
    references: [users.id],
  }),
}));

export const financialAccountsRelations = relations(
  financialAccounts,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [financialAccounts.companyId],
      references: [companies.id],
    }),
    parent: one(financialAccounts, {
      fields: [financialAccounts.parentId],
      references: [financialAccounts.id],
    }),
    transactions: many(transactions),
    forecastLines: many(forecastLines),
  })
);

export const transactionsRelations = relations(transactions, ({ one }) => ({
  company: one(companies, {
    fields: [transactions.companyId],
    references: [companies.id],
  }),
  account: one(financialAccounts, {
    fields: [transactions.accountId],
    references: [financialAccounts.id],
  }),
  importBatch: one(importBatches, {
    fields: [transactions.importBatchId],
    references: [importBatches.id],
  }),
}));

export const importBatchesRelations = relations(
  importBatches,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [importBatches.companyId],
      references: [companies.id],
    }),
    account: one(financialAccounts, {
      fields: [importBatches.accountId],
      references: [financialAccounts.id],
    }),
    transactions: many(transactions),
  })
);

export const scenariosRelations = relations(scenarios, ({ one, many }) => ({
  company: one(companies, {
    fields: [scenarios.companyId],
    references: [companies.id],
  }),
  overrides: many(scenarioOverrides),
}));

export const scenarioOverridesRelations = relations(scenarioOverrides, ({ one }) => ({
  scenario: one(scenarios, {
    fields: [scenarioOverrides.scenarioId],
    references: [scenarios.id],
  }),
}));

export const forecastLinesRelations = relations(
  forecastLines,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [forecastLines.companyId],
      references: [companies.id],
    }),
    account: one(financialAccounts, {
      fields: [forecastLines.accountId],
      references: [financialAccounts.id],
    }),
    values: many(forecastValues),
  })
);

export const forecastValuesRelations = relations(forecastValues, ({ one }) => ({
  forecastLine: one(forecastLines, {
    fields: [forecastValues.forecastLineId],
    references: [forecastLines.id],
  }),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  company: one(companies, {
    fields: [departments.companyId],
    references: [companies.id],
  }),
  headcountPlans: many(headcountPlans),
}));

export const headcountPlansRelations = relations(headcountPlans, ({ one, many }) => ({
  company: one(companies, {
    fields: [headcountPlans.companyId],
    references: [companies.id],
  }),
  department: one(departments, {
    fields: [headcountPlans.departmentId],
    references: [departments.id],
  }),
  salaryChanges: many(salaryChanges),
  bonuses: many(bonuses),
  equityGrants: many(equityGrants),
}));

export const salaryChangesRelations = relations(salaryChanges, ({ one }) => ({
  company: one(companies, {
    fields: [salaryChanges.companyId],
    references: [companies.id],
  }),
  headcount: one(headcountPlans, {
    fields: [salaryChanges.headcountId],
    references: [headcountPlans.id],
  }),
}));

export const bonusesRelations = relations(bonuses, ({ one }) => ({
  company: one(companies, {
    fields: [bonuses.companyId],
    references: [companies.id],
  }),
  headcount: one(headcountPlans, {
    fields: [bonuses.headcountId],
    references: [headcountPlans.id],
  }),
}));

export const equityGrantsRelations = relations(equityGrants, ({ one }) => ({
  company: one(companies, {
    fields: [equityGrants.companyId],
    references: [companies.id],
  }),
  headcount: one(headcountPlans, {
    fields: [equityGrants.headcountId],
    references: [headcountPlans.id],
  }),
}));

export const revenueStreamsRelations = relations(revenueStreams, ({ one }) => ({
  company: one(companies, {
    fields: [revenueStreams.companyId],
    references: [companies.id],
  }),
}));

export const fundingRoundsRelations = relations(fundingRounds, ({ one, many }) => ({
  company: one(companies, { fields: [fundingRounds.companyId], references: [companies.id] }),
  investors: many(fundingRoundInvestors),
}));

export const fundingRoundInvestorsRelations = relations(fundingRoundInvestors, ({ one }) => ({
  round: one(fundingRounds, {
    fields: [fundingRoundInvestors.fundingRoundId],
    references: [fundingRounds.id],
  }),
}));

export const shareClassesRelations = relations(shareClasses, ({ one }) => ({
  company: one(companies, { fields: [shareClasses.companyId], references: [companies.id] }),
}));

export const optionPoolsRelations = relations(optionPools, ({ one }) => ({
  company: one(companies, { fields: [optionPools.companyId], references: [companies.id] }),
}));

export const metricsRelations = relations(metrics, ({ one }) => ({
  company: one(companies, {
    fields: [metrics.companyId],
    references: [companies.id],
  }),
}));

export const integrationsRelations = relations(integrations, ({ one }) => ({
  company: one(companies, {
    fields: [integrations.companyId],
    references: [companies.id],
  }),
}));

export const aiFeatureFlagsRelations = relations(aiFeatureFlags, ({ one }) => ({
  company: one(companies, {
    fields: [aiFeatureFlags.companyId],
    references: [companies.id],
  }),
}));

export const aiConversationsRelations = relations(
  aiConversations,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [aiConversations.companyId],
      references: [companies.id],
    }),
    user: one(users, {
      fields: [aiConversations.userId],
      references: [users.id],
    }),
    messages: many(aiMessages),
  })
);

export const aiInsightCacheRelations = relations(aiInsightCache, ({ one }) => ({
  company: one(companies, {
    fields: [aiInsightCache.companyId],
    references: [companies.id],
  }),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  conversation: one(aiConversations, {
    fields: [aiMessages.conversationId],
    references: [aiConversations.id],
  }),
}));

// ── Weekly Digests (Monday Morning CFO) ─────────────────────────────────

export const weeklyDigests = pgTable(
  "weekly_digests",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    weekStart: timestamp("week_start", { mode: "date" }).notNull(),
    metrics: jsonb("metrics").notNull(),
    narrative: text("narrative"),
    deterministicSummary: text("deterministic_summary").notNull(),
    emailSentAt: timestamp("email_sent_at", { mode: "date" }),
    dismissedAt: timestamp("dismissed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("weekly_digests_company_idx").on(table.companyId),
    uniqueIndex("weekly_digests_company_week_idx").on(
      table.companyId,
      table.weekStart
    ),
  ]
);

export const weeklyDigestsRelations = relations(weeklyDigests, ({ one }) => ({
  company: one(companies, {
    fields: [weeklyDigests.companyId],
    references: [companies.id],
  }),
}));

// ── Privacy Consent ──────────────────────────────────────────────────────────

export const consentPurposeEnum = pgEnum("consent_purpose", [
  "data_processing",
  "ai_features",
  "marketing",
  "analytics",
]);

export const privacyConsents = pgTable(
  "privacy_consents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: consentPurposeEnum("purpose").notNull(),
    granted: boolean("granted").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    grantedAt: timestamp("granted_at", { mode: "date" }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("privacy_consents_user_idx").on(table.userId),
    index("privacy_consents_user_purpose_idx").on(table.userId, table.purpose),
  ]
);

export const privacyConsentsRelations = relations(
  privacyConsents,
  ({ one }) => ({
    user: one(users, {
      fields: [privacyConsents.userId],
      references: [users.id],
    }),
  })
);

// ── Merchant Category Mappings (learned from user overrides) ────────────────

export const merchantCategoryMappings = pgTable(
  "merchant_category_mappings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    merchantPattern: text("merchant_pattern").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    category: accountCategoryEnum("category").notNull(),
    subcategory: text("subcategory").notNull(),
    source: text("source").notNull().default("user_override"),
    overrideCount: integer("override_count").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("merchant_mappings_company_idx").on(table.companyId),
    index("merchant_mappings_pattern_idx").on(table.merchantPattern),
    index("merchant_mappings_account_idx").on(table.accountId),
    uniqueIndex("merchant_mappings_company_pattern_idx").on(
      table.companyId,
      table.merchantPattern
    ),
  ]
);

export const merchantCategoryMappingsRelations = relations(
  merchantCategoryMappings,
  ({ one }) => ({
    company: one(companies, {
      fields: [merchantCategoryMappings.companyId],
      references: [companies.id],
    }),
    account: one(financialAccounts, {
      fields: [merchantCategoryMappings.accountId],
      references: [financialAccounts.id],
    }),
  })
);

// ── Financial Audit Logs ─────────────────────────────────────────────────────

export const auditActionEnum = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
  "import",
  "rollback",
]);

export const auditEntityTypeEnum = pgEnum("audit_entity_type", [
  "transaction",
  "financial_account",
  "scenario",
  "forecast_line",
  "forecast_value",
  "headcount_plan",
  "revenue_stream",
  "funding_round",
  "import_batch",
  "department",
  "metric",
  "salary_change",
  "bonus",
  "equity_grant",
  "funding_round_investor",
  "share_class",
  "option_pool",
]);

export const financialAuditLogs = pgTable(
  "financial_audit_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityType: auditEntityTypeEnum("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: auditActionEnum("action").notNull(),
    changes: jsonb("changes"), // { before?: Record, after?: Record } — null for creates/deletes when full snapshot not needed
    metadata: jsonb("metadata"), // extra context: IP, user agent, import batch ID, etc.
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("financial_audit_company_idx").on(table.companyId),
    index("financial_audit_entity_idx").on(table.entityType, table.entityId),
    index("financial_audit_user_idx").on(table.companyId, table.userId),
    index("financial_audit_created_idx").on(table.companyId, table.createdAt),
  ]
);

export const financialAuditLogsRelations = relations(
  financialAuditLogs,
  ({ one }) => ({
    company: one(companies, {
      fields: [financialAuditLogs.companyId],
      references: [companies.id],
    }),
    user: one(users, {
      fields: [financialAuditLogs.userId],
      references: [users.id],
    }),
  })
);

// ── AI Tool Audit Logs ───────────────────────────────────────────────────────

export const aiToolAuditLogStatusEnum = pgEnum("ai_tool_audit_log_status", [
  "success",
  "error",
  "validation_error",
]);

export const aiToolAuditLogs = pgTable(
  "ai_tool_audit_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .references(() => aiConversations.id, { onDelete: "set null" }),
    toolName: text("tool_name").notNull(),
    input: jsonb("input").notNull(),
    status: aiToolAuditLogStatusEnum("status").notNull(),
    permissionDecision: aiToolPermissionDecisionEnum("permission_decision"),
    result: jsonb("result"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("ai_tool_audit_company_idx").on(table.companyId),
    index("ai_tool_audit_user_idx").on(table.companyId, table.userId),
    index("ai_tool_audit_created_idx").on(table.companyId, table.createdAt),
    index("ai_tool_audit_tool_idx").on(table.companyId, table.toolName),
    index("ai_tool_audit_conversation_idx").on(table.conversationId),
  ]
);

// ── Invite Codes (platform-level early access distribution) ─────────────────

export const inviteCodeTypeEnum = pgEnum("invite_code_type", [
  "single_use",
  "multi_use",
]);

export const inviteCodes = pgTable(
  "invite_codes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    code: text("code").notNull(),
    type: inviteCodeTypeEnum("type").notNull().default("single_use"),
    maxRedemptions: integer("max_redemptions").notNull().default(1),
    currentRedemptions: integer("current_redemptions").notNull().default(0),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    freePlatformDays: integer("free_platform_days").notNull().default(30),
    aiCreditsCents: integer("ai_credits_cents").notNull().default(5000), // $50 default
    isActive: boolean("is_active").notNull().default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("invite_codes_code_idx").on(table.code),
    index("invite_codes_created_by_idx").on(table.createdBy),
    index("invite_codes_active_idx").on(table.isActive),
  ]
);

export const inviteCodeRedemptions = pgTable(
  "invite_code_redemptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    inviteCodeId: text("invite_code_id")
      .notNull()
      .references(() => inviteCodes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redeemedAt: timestamp("redeemed_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("invite_redemptions_code_idx").on(table.inviteCodeId),
    uniqueIndex("invite_redemptions_user_code_idx").on(
      table.inviteCodeId,
      table.userId
    ),
  ]
);

export const inviteCodesRelations = relations(inviteCodes, ({ one, many }) => ({
  creator: one(users, {
    fields: [inviteCodes.createdBy],
    references: [users.id],
  }),
  redemptions: many(inviteCodeRedemptions),
}));

export const inviteCodeRedemptionsRelations = relations(
  inviteCodeRedemptions,
  ({ one }) => ({
    inviteCode: one(inviteCodes, {
      fields: [inviteCodeRedemptions.inviteCodeId],
      references: [inviteCodes.id],
    }),
    user: one(users, {
      fields: [inviteCodeRedemptions.userId],
      references: [users.id],
    }),
  })
);

export const aiToolAuditLogsRelations = relations(aiToolAuditLogs, ({ one }) => ({
  company: one(companies, {
    fields: [aiToolAuditLogs.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [aiToolAuditLogs.userId],
    references: [users.id],
  }),
  conversation: one(aiConversations, {
    fields: [aiToolAuditLogs.conversationId],
    references: [aiConversations.id],
  }),
}));

// ── User Preferences (sidebar order, quick action mode, UI settings) ────────

export const quickActionModeEnum = pgEnum("quick_action_mode", [
  "intelligence",
  "dynamic",
  "custom",
]);

export const userPreferences = pgTable(
  "user_preferences",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    sidebarOrder: jsonb("sidebar_order").$type<string[]>(), // ordered array of nav item IDs
    quickActionMode: quickActionModeEnum("quick_action_mode").notNull().default("dynamic"),
    quickActionModeOverrides: jsonb("quick_action_mode_overrides").$type<Record<string, "intelligence" | "dynamic" | "custom">>(), // per-action mode overrides
    customQuickActions: jsonb("custom_quick_actions").$type<string[]>(), // IDs of pinned quick actions
    sidebarCollapsed: boolean("sidebar_collapsed").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("user_preferences_user_company_idx").on(
      table.userId,
      table.companyId
    ),
  ]
);

export const userPreferencesRelations = relations(
  userPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [userPreferences.userId],
      references: [users.id],
    }),
    company: one(companies, {
      fields: [userPreferences.companyId],
      references: [companies.id],
    }),
  })
);

// ── AI Permission Defaults (per-user, per-company tool permission settings) ──

export const aiPermissionDefaults = pgTable(
  "ai_permission_defaults",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    readMode: aiPermissionModeEnum("read_mode").notNull().default("always"),
    writeMode: aiPermissionModeEnum("write_mode").notNull().default("ask"),
    // Delete never offers "always" (enforced in app + resolver); column reuses the
    // shared enum but only "ask" / "session" are ever written.
    deleteMode: aiPermissionModeEnum("delete_mode").notNull().default("ask"),
    webSearchMode: aiPermissionModeEnum("web_search_mode").notNull().default("always"),
    browserUseMode: aiPermissionModeEnum("browser_use_mode").notNull().default("ask"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("ai_permission_defaults_user_company_idx").on(
      table.userId,
      table.companyId
    ),
  ]
);

// ── AI Usage Logs (cost tracking per feature) ───────────────────────────────

export const aiUsageLogs = pgTable(
  "ai_usage_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(),
    tier: text("tier").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    estimatedCostMicros: integer("estimated_cost_micros").notNull().default(0),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("ai_usage_company_idx").on(table.companyId),
    index("ai_usage_feature_idx").on(table.companyId, table.feature),
    index("ai_usage_created_idx").on(table.companyId, table.createdAt),
  ]
);

// ── Export Tracking ─────────────────────────────────────────────────────────

export const exportLogs = pgTable(
  "export_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exportType: text("export_type").notNull(),
    format: text("format").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("export_logs_company_idx").on(table.companyId),
    index("export_logs_company_created_idx").on(table.companyId, table.createdAt),
    index("export_logs_user_idx").on(table.userId),
  ]
);
