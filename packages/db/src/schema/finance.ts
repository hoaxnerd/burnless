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
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { companies, departments } from "./tenant";

// ── Enums ─────────────────────────────────────────────────────────────────────

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

export const headcountEmployeeTypeEnum = pgEnum("headcount_employee_type", [
  "full_time",
  "part_time",
  "contractor",
]);

export const equityGrantTypeEnum = pgEnum("equity_grant_type", [
  "iso",
  "nso",
  "rsu",
]);

// FAIL-4b: classify share classes by an explicit enum, not a /common/i name
// regex. "common" folds into the founders row; "preferred" emits its own row.
export const shareClassTypeEnum = pgEnum("share_class_type", [
  "common",
  "preferred",
]);

export const importBatchStatusEnum = pgEnum("import_batch_status", [
  "pending",
  "processing",
  "completed",
  "rolled_back",
  "failed",
]);

export const bonusTypeEnum = pgEnum("bonus_type", [
  "signing",
  "performance",
  "retention",
  "other",
]);

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
    // When true, transactions on this account ARE personnel cost that the
    // headcount plan also models. The compute layer then uses these actuals in
    // months where they exist and suppresses the headcount-plan cost for those
    // months, so payroll isn't double-counted (actuals in closed months, plan
    // in forecast months). See `reconcileHeadcountWithActuals`.
    coversHeadcount: boolean("covers_headcount").notNull().default(false),
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

// ── Import Batches ───────────────────────────────────────────────────────────

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
    /**
     * Phase 4 §4.1 — stable identifier a `custom_formula` expression can
     * reference (`CloudCosts * 2`). Sanitized `^[A-Za-z_][A-Za-z0-9_]*$`;
     * unique per company when non-null (see partial index below).
     */
    name: text("name"),
    // ── Phase 1 additions (§2.C) ─────────────────────────────────────────
    notes: text("notes"),
    vendor: text("vendor"),
    /**
     * Explicit per-line expense category override (set in the expense form).
     * NULL = derive automatically (merchant rules → account → "Uncategorized").
     * A non-null value WINS over derivation in compute-expenses deriveSubcategory.
     */
    subcategory: text("subcategory"),
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
    // Phase 4 §4.1 — line names are unique per company when set (NULL allowed).
    uniqueIndex("forecast_lines_company_name_idx")
      .on(table.companyId, table.name)
      .where(sql`${table.name} IS NOT NULL`),
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
    classType: shareClassTypeEnum("class_type").notNull().default("preferred"),
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

// ── Financial Audit Logs ─────────────────────────────────────────────────────

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
