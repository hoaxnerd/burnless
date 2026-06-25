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
import { users } from "./auth";
import { companies } from "./tenant";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const dashboardModeEnum = pgEnum("dashboard_mode", [
  "intelligence",
  "dynamic",
  "custom",
]);

export const quickActionModeEnum = pgEnum("quick_action_mode", [
  "intelligence",
  "dynamic",
  "custom",
]);

export const notificationSeverityEnum = pgEnum("notification_severity", [
  "info",
  "success",
  "warning",
  "error",
]);

export const consentPurposeEnum = pgEnum("consent_purpose", [
  "data_processing",
  "ai_features",
  "marketing",
  "analytics",
]);

// ── Scheduled AI jobs (S3a Plan 4) ──────────────────────────────────────────

export const scheduledJobActionKindEnum = pgEnum("scheduled_job_action_kind", ["write", "notify"]);
export const scheduledJobStatusEnum = pgEnum("scheduled_job_status", [
  "active",
  "disabled",
  "auto_disabled",
  "error",
]);
export const scheduledJobNotifyPolicyEnum = pgEnum("scheduled_job_notify_policy", [
  "smart",
  "failures",
  "every",
  "off",
]);
export const scheduledJobRunStatusEnum = pgEnum("scheduled_job_run_status", [
  "running",
  "success",
  "failed",
  "missed",
]);
export const scheduledJobRunTriggerEnum = pgEnum("scheduled_job_run_trigger", [
  "schedule",
  "manual",
  "dry_run",
]);

/**
 * User-defined scheduled AI jobs (S3a Plan 4). A job = a bounded agentic run:
 * a capped chat tool-loop restricted to `allowedTools` (a frozen allowlist,
 * scope-minimized at creation), executed headless with no live session.
 * `nextRunAt` (recomputed from `schedule` after each run) is the authoritative
 * due signal. System/operational jobs are NOT here — they stay code-registered.
 */
export const scheduledJobs = pgTable(
  "scheduled_jobs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    actionKind: scheduledJobActionKindEnum("action_kind").notNull(),
    /** Frozen tool-name allowlist (financial tool names + `mcp__*` names). */
    allowedTools: jsonb("allowed_tools").$type<string[]>().notNull().default([]),
    /** MCP connection ids whose creds the run resolves. */
    boundConnectionIds: jsonb("bound_connection_ids").$type<string[]>().notNull().default([]),
    /** 5-field UTC cron expression. */
    schedule: text("schedule").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    enabled: boolean("enabled").notNull().default(true),
    status: scheduledJobStatusEnum("status").notNull().default("active"),
    notifyPolicy: scheduledJobNotifyPolicyEnum("notify_policy").notNull().default("smart"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastRunAt: timestamp("last_run_at", { mode: "date" }),
    nextRunAt: timestamp("next_run_at", { mode: "date" }),
    /** Idempotency context handed to the agent on the next run (last-run cursor/summary). */
    lastRunCursor: jsonb("last_run_cursor").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [
    index("scheduled_jobs_company_idx").on(table.companyId),
    index("scheduled_jobs_due_idx").on(table.enabled, table.nextRunAt),
  ]
);

/**
 * One row per fire of a scheduled job (success/failed/missed). `summary` is the
 * one-line "what it did" surfaced in run history + notifications; `output` holds
 * the structured tool-result digest; `trigger` distinguishes scheduled vs manual
 * "Run now" vs a dry-run preview.
 */
export const scheduledJobRuns = pgTable(
  "scheduled_job_runs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    scheduledJobId: text("scheduled_job_id").notNull().references(() => scheduledJobs.id, { onDelete: "cascade" }),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    status: scheduledJobRunStatusEnum("status").notNull(),
    trigger: scheduledJobRunTriggerEnum("trigger").notNull(),
    startedAt: timestamp("started_at", { mode: "date" }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { mode: "date" }),
    durationMs: integer("duration_ms"),
    tokensUsed: integer("tokens_used"),
    summary: text("summary"),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
  },
  (table) => [
    index("scheduled_job_runs_job_idx").on(table.scheduledJobId, table.startedAt),
    index("scheduled_job_runs_company_idx").on(table.companyId),
  ]
);

// ── Dashboard Preferences (per-user layout, mode, card customization) ────────

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
    /**
     * Per-page layout overrides: { [pageId]: { order: [...], closedWidgets: [...] } }.
     * `order` is the screen-independent widget order (current model). `layout`
     * is the legacy coordinate form, retained for backward-compatible reads of
     * rows written before the fluid-flow migration.
     */
    pageLayouts: jsonb("page_layouts")
      .$type<
        Record<
          string,
          {
            order?: string[];
            layout?: Array<{
              widgetId: string;
              x?: number;
              y?: number;
              w?: number;
              h?: number;
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

// ── User Preferences (sidebar order, quick action mode, UI settings) ────────

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
    /** D11: connection ids this user removed from THEIR AI context (AI-sidebar kill-switch). */
    disabledMcpConnections: jsonb("disabled_mcp_connections").$type<string[]>(),
    /** S3b: built-in tool ids this user disabled from THEIR AI context (Tools-pane kill-switch). */
    disabledBuiltinTools: jsonb("disabled_builtin_tools").$type<string[]>(),
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

/**
 * Generic in-app notifications (S3a Plan 2). Feature-agnostic: any server code
 * posts via createNotification(). `category` is a free-form source tag (e.g.
 * "automation", "connection"); `link` is an in-app deep link; `readAt` null =
 * unread. Recipient = (companyId, userId).
 */
export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    severity: notificationSeverityEnum("severity").notNull().default("info"),
    link: text("link"),
    metadata: jsonb("metadata"),
    readAt: timestamp("read_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("notifications_user_idx").on(table.userId, table.companyId),
    index("notifications_unread_idx").on(table.userId, table.readAt),
    index("notifications_created_idx").on(table.createdAt),
  ]
);

// ── Privacy Consent ──────────────────────────────────────────────────────────

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
