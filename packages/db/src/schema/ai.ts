import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { companies } from "./tenant";
import { mcpConnections } from "./integrations";
import { scheduledJobRuns } from "./platform";

// ── Enums ─────────────────────────────────────────────────────────────────────

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

export const aiProviderKindEnum = pgEnum("ai_provider_kind", [
  "anthropic","openai","openrouter","ollama","google","mistral","groq","openai-compatible",
]);
export const aiApiKeyModeEnum = pgEnum("ai_api_key_mode", ["managed","user_provided","none"]);
export const aiProviderModelSourceEnum = pgEnum("ai_provider_model_source", ["fetched","manual","preset"]);

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

export const aiTurnEventTypeEnum = pgEnum("ai_turn_event_type", [
  "user_message",
  "assistant_step",
  "tool_result",
  "scenario",
  "gate",
  "turn_done",
  "turn_error",
]);

export const aiToolAuditLogStatusEnum = pgEnum("ai_tool_audit_log_status", [
  "success",
  "error",
  "validation_error",
  "pending_apply",
]);

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
    writeMode: aiWriteModeEnum("write_mode").notNull().default("confirm"),
    // Configurable companion name (default: "Companion")
    companionName: text("companion_name").notNull().default("Companion"),
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

// ── AI Providers (P2: per-company multi-provider config; keys encrypted at rest) ──
export const aiProviders = pgTable(
  "ai_providers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: aiProviderKindEnum("kind").notNull(),
    baseUrl: text("base_url"),
    apiKeyEncrypted: text("api_key_encrypted"),
    apiKeyMode: aiApiKeyModeEnum("api_key_mode").notNull().default("user_provided"),
    headers: jsonb("headers"),
    dropParams: jsonb("drop_params"),
    enabled: boolean("enabled").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [index("ai_providers_company_idx").on(table.companyId)]
);

export const aiProviderModels = pgTable(
  "ai_provider_models",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    providerId: text("provider_id").notNull().references(() => aiProviders.id, { onDelete: "cascade" }),
    modelId: text("model_id").notNull(),
    displayName: text("display_name"),
    contextWindow: integer("context_window"),
    maxOutputTokens: integer("max_output_tokens"),
    supportsTools: boolean("supports_tools"),
    supportsImages: boolean("supports_images"),
    source: aiProviderModelSourceEnum("source").notNull().default("manual"),
    enabled: boolean("enabled").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("ai_provider_models_provider_idx").on(table.providerId),
    uniqueIndex("ai_provider_models_provider_model_idx").on(table.providerId, table.modelId),
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
    /** S3b: tool ids disabled "for this session" in this conversation, e.g. { "tool_id": true }. */
    sessionDisabledTools: jsonb("session_disabled_tools")
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

export const aiTurnEvents = pgTable(
  "ai_turn_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    /** Monotonic per-conversation order. Assigned via atomic MAX(seq)+1 (see turn-events.ts). */
    seq: integer("seq").notNull(),
    /** Groups events of one user→completion turn. */
    turnId: text("turn_id").notNull(),
    type: aiTurnEventTypeEnum("type").notNull(),
    /** Type-specific payload (see @burnless/ai turn-log/types.ts). */
    payload: jsonb("payload").notNull(),
    /** Gate events only: null = open. */
    resolvedAt: timestamp("resolved_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    // Ordered read + collision detection for the atomic seq assignment.
    uniqueIndex("ai_turn_events_conversation_seq_idx").on(
      table.conversationId,
      table.seq
    ),
    // At most one OPEN gate per conversation.
    uniqueIndex("ai_turn_events_open_gate_idx")
      .on(table.conversationId)
      .where(sql`${table.type} = 'gate' AND ${table.resolvedAt} IS NULL`),
  ]
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

// ── AI Tool Audit Logs ───────────────────────────────────────────────────────

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
    /** Set when the tool was an external MCP tool (spec §3.3 audit reuse). */
    mcpConnectionId: text("mcp_connection_id").references(() => mcpConnections.id, { onDelete: "set null" }),
    /** When set, links every tool call to its scheduled-job run (S3a Plan 4). */
    scheduledJobRunId: text("scheduled_job_run_id").references(() => scheduledJobRuns.id, { onDelete: "set null" }),
    toolName: text("tool_name").notNull(),
    input: jsonb("input").notNull(),
    status: aiToolAuditLogStatusEnum("status").notNull(),
    permissionDecision: aiToolPermissionDecisionEnum("permission_decision"),
    result: jsonb("result"),
    durationMs: integer("duration_ms"),
    /** Audit attribution (expose spec B5): where the call came from.
     *  Existing chat writers rely on the default — do not backfill. */
    source: text("source").notNull().default("chat"),
    /** "pat" | "oauth" — set only for source='mcp_server' rows. */
    credentialType: text("credential_type"),
    /** apiTokens.id (PAT) or oauthTokens.grantId (OAuth grant family). */
    credentialId: text("credential_id"),
    /** MCP initialize handshake identity, e.g. { name: "burnless-cli", version: "0.1.0" }. */
    clientInfo: jsonb("client_info").$type<{ name?: string; version?: string }>(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("ai_tool_audit_company_idx").on(table.companyId),
    index("ai_tool_audit_user_idx").on(table.companyId, table.userId),
    index("ai_tool_audit_created_idx").on(table.companyId, table.createdAt),
    index("ai_tool_audit_tool_idx").on(table.companyId, table.toolName),
    index("ai_tool_audit_conversation_idx").on(table.conversationId),
    index("ai_tool_audit_mcp_connection_idx").on(table.mcpConnectionId),
    index("ai_tool_audit_scheduled_job_run_idx").on(table.scheduledJobRunId),
  ]
);
