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
import { users, oauthClients } from "./auth";

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

export const memberRoleEnum = pgEnum("member_role", [
  "owner",
  "admin",
  "editor",
  "viewer",
]);

export const dataRegionEnum = pgEnum("data_region", [
  "us-east",
  "eu-west",
  "ap-south",
]);

export const inviteCodeTypeEnum = pgEnum("invite_code_type", [
  "single_use",
  "multi_use",
]);

// ── Business Entities ─────────────────────────────────────────────────────────

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
  /** B8 kill switch (expose spec §3): false ⇒ every inbound /mcp call 403s.
   *  Tokens stay intact; flipping back on restores access. Default true. */
  mcpServerEnabled: boolean("mcp_server_enabled").notNull().default(true),
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

// ── Invite Codes (platform-level early access distribution) ─────────────────

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

// ── MCP Expose: PATs + OAuth AS (expose spec 2026-06-11 §5.3) ───────────────
// These tables FK to both users (auth) and companies (tenant), so live here.

/** Single-use authorization codes (10-min TTL), hashed at rest (spec §5.2). */
export const oauthAuthCodes = pgTable(
  "oauth_auth_codes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    codeHash: text("code_hash").notNull(),
    clientId: text("client_id").notNull().references(() => oauthClients.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    scopes: jsonb("scopes").$type<("read" | "write" | "delete")[]>().notNull(),
    codeChallenge: text("code_challenge").notNull(),
    resource: text("resource").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("oauth_auth_codes_hash_idx").on(table.codeHash)]
);

/** Access+refresh token pairs, hashed at rest. `grantId` groups a rotation
 *  family: refresh rotation supersedes the old row; presenting a superseded
 *  refresh token revokes the whole family (spec §5.2 reuse detection).
 *  `resource` is the RFC 8707 audience — must equal `${APP_URL}/mcp`. */
export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    grantId: text("grant_id").notNull(),
    clientId: text("client_id").notNull().references(() => oauthClients.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    scopes: jsonb("scopes").$type<("read" | "write" | "delete")[]>().notNull(),
    accessTokenHash: text("access_token_hash").notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    resource: text("resource").notNull(),
    accessExpiresAt: timestamp("access_expires_at", { mode: "date" }).notNull(),
    supersededAt: timestamp("superseded_at", { mode: "date" }),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("oauth_tokens_access_hash_idx").on(table.accessTokenHash),
    uniqueIndex("oauth_tokens_refresh_hash_idx").on(table.refreshTokenHash),
    index("oauth_tokens_grant_idx").on(table.grantId),
    index("oauth_tokens_user_company_idx").on(table.userId, table.companyId),
  ]
);

/** Personal access tokens for the exposed MCP server (spec §5.1). The secret
 *  is stored ONLY as a SHA-256 hash (deliberately hash-not-encrypt — it never
 *  needs to be read back; crypto.ts AES stays for retrievable secrets).
 *  `lastFour` is UI mask material (`bl_pat_••••f42a`), not secret. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    scopes: jsonb("scopes").$type<("read" | "write" | "delete")[]>().notNull(),
    lastFour: text("last_four").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("api_tokens_hash_idx").on(table.tokenHash),
    index("api_tokens_user_company_idx").on(table.userId, table.companyId),
    index("api_tokens_company_idx").on(table.companyId),
  ]
);
