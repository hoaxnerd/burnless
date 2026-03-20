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
import { relations } from "drizzle-orm";

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

export const scenarioTypeEnum = pgEnum("scenario_type", [
  "base",
  "best",
  "worst",
  "custom",
]);

export const forecastMethodEnum = pgEnum("forecast_method", [
  "fixed",
  "growth_rate",
  "per_unit",
  "percentage_of",
  "custom_formula",
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
]);

export const revenueStreamTypeEnum = pgEnum("revenue_stream_type", [
  "subscription",
  "one_time",
  "usage_based",
  "services",
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
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

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
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePlan: text("stripe_plan").default("free"),
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
  ]
);

export const departments = pgTable("departments", {
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
});

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
    type: scenarioTypeEnum("type").notNull().default("base"),
    isDefault: boolean("is_default").notNull().default(false),
    isBudget: boolean("is_budget").notNull().default(false),
    budgetLockedAt: timestamp("budget_locked_at", { mode: "date" }),
    description: text("description"),
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

export const forecastLines = pgTable(
  "forecast_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarios.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    method: forecastMethodEnum("method").notNull().default("fixed"),
    parameters: jsonb("parameters").notNull().default({}),
    startDate: timestamp("start_date", { mode: "date" }).notNull(),
    endDate: timestamp("end_date", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("forecast_lines_scenario_idx").on(table.scenarioId),
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
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarios.id, { onDelete: "cascade" }),
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    count: integer("count").notNull().default(1),
    salary: numeric("salary", { precision: 12, scale: 2 }).notNull(),
    startDate: timestamp("start_date", { mode: "date" }).notNull(),
    endDate: timestamp("end_date", { mode: "date" }),
    benefitsRate: numeric("benefits_rate", { precision: 5, scale: 4 })
      .notNull()
      .default("0.20"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("headcount_plans_scenario_idx").on(table.scenarioId),
  ]
);

// ── Revenue Streams ───────────────────────────────────────────────────────────

export const revenueStreams = pgTable(
  "revenue_streams",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarios.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: revenueStreamTypeEnum("type").notNull().default("subscription"),
    parameters: jsonb("parameters").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("revenue_streams_scenario_idx").on(table.scenarioId),
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
    dilutionPercent: numeric("dilution_percent", { precision: 5, scale: 4 }),
    isProjected: boolean("is_projected").notNull().default(false),
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
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("ai_conversations_company_idx").on(table.companyId),
  ]
);

// ── AI Insight Cache ─────────────────────────────────────────────────────────

export const aiInsightCacheTypeEnum = pgEnum("ai_insight_cache_type", [
  "dashboard",
  "revenue",
  "expense",
  "scenario",
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
    index("ai_messages_conversation_idx").on(table.conversationId),
  ]
);

// ── Relations ─────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  companyMemberships: many(companyMembers),
  ownedCompanies: many(companies),
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
  departments: many(departments),
  fundingRounds: many(fundingRounds),
  metrics: many(metrics),
  integrations: many(integrations),
  importBatches: many(importBatches),
  aiFeatureFlags: many(aiFeatureFlags),
  aiConversations: many(aiConversations),
  aiInsightCache: many(aiInsightCache),
  weeklyDigests: many(weeklyDigests),
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
  forecastLines: many(forecastLines),
  headcountPlans: many(headcountPlans),
  revenueStreams: many(revenueStreams),
}));

export const forecastLinesRelations = relations(
  forecastLines,
  ({ one, many }) => ({
    scenario: one(scenarios, {
      fields: [forecastLines.scenarioId],
      references: [scenarios.id],
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

export const headcountPlansRelations = relations(headcountPlans, ({ one }) => ({
  scenario: one(scenarios, {
    fields: [headcountPlans.scenarioId],
    references: [scenarios.id],
  }),
  department: one(departments, {
    fields: [headcountPlans.departmentId],
    references: [departments.id],
  }),
}));

export const revenueStreamsRelations = relations(revenueStreams, ({ one }) => ({
  scenario: one(scenarios, {
    fields: [revenueStreams.scenarioId],
    references: [scenarios.id],
  }),
}));

export const fundingRoundsRelations = relations(fundingRounds, ({ one }) => ({
  company: one(companies, {
    fields: [fundingRounds.companyId],
    references: [companies.id],
  }),
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
