import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { companies } from "./tenant";

// ── Enums ─────────────────────────────────────────────────────────────────────

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

// ── MCP (spec 2026-06-10 §3.3) ───────────────────────────────────────────────
export const mcpTransportEnum = pgEnum("mcp_transport", ["streamable_http", "stdio"]);
export const mcpOwnerScopeEnum = pgEnum("mcp_owner_scope", ["company", "personal"]);
export const mcpAuthTypeEnum = pgEnum("mcp_auth_type", ["oauth", "pat", "none"]);
export const mcpConnectionStatusEnum = pgEnum("mcp_connection_status", [
  "pending",
  "connected",
  "needs_auth",
  "error",
  "disabled",
]);
export const mcpToolPermEnum = pgEnum("mcp_tool_perm", ["read", "write", "delete"]);

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

/** Per-company encrypted credentials for a data integration (one row per company+type).
 *  `secret` is encryptJson({ apiKey }) — AES-256-GCM via crypto.ts. Never plaintext. */
export const integrationCredentials = pgTable(
  "integration_credentials",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    integrationType: integrationTypeEnum("integration_type").notNull(),
    secret: text("secret").notNull(),
    livemode: boolean("livemode").notNull().default(false),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("integration_credentials_company_type_idx").on(
      table.companyId,
      table.integrationType
    ),
  ]
);

// ── MCP Connections ──────────────────────────────────────────────────────────

/** A configured external MCP server (company-shared or personal). */
export const mcpConnections = pgTable(
  "mcp_connections",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    ownerScope: mcpOwnerScopeEnum("owner_scope").notNull().default("company"),
    /** Required when ownerScope = personal; null for company-shared. */
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Tool-namespace slug derived from name at create time: mcp__<slug>__<tool>. */
    slug: text("slug").notNull(),
    transport: mcpTransportEnum("transport").notNull(),
    /** streamable_http: server URL. stdio: the executable command. */
    endpoint: text("endpoint").notNull(),
    /** stdio only: argv after the command. */
    args: jsonb("args").$type<string[]>(),
    /** stdio only: non-secret env passed to the child process. */
    env: jsonb("env").$type<Record<string, string>>(),
    authType: mcpAuthTypeEnum("auth_type").notNull().default("none"),
    status: mcpConnectionStatusEnum("status").notNull().default("pending"),
    /** Cached handshake result: { protocolVersion?, serverName?, tools: McpToolInfo[] }. */
    capabilities: jsonb("capabilities").$type<{
      protocolVersion?: string;
      serverName?: string;
      tools: Array<{
        name: string;
        description?: string;
        inputSchema: Record<string, unknown>;
        annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
      }>;
    }>(),
    lastError: text("last_error"),
    lastConnectedAt: timestamp("last_connected_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    index("mcp_connections_company_idx").on(table.companyId),
    index("mcp_connections_owner_idx").on(table.companyId, table.ownerScope, table.ownerUserId),
    uniqueIndex("mcp_connections_company_name_idx").on(table.companyId, table.name),
    uniqueIndex("mcp_connections_company_slug_idx").on(table.companyId, table.slug),
    check(
      "mcp_connections_personal_owner_check",
      sql`(owner_scope = 'personal') = (owner_user_id IS NOT NULL)`
    ),
  ]
);

/** Credentials for one connection. `secret` is an encrypted blob (crypto.ts) —
 *  nullable because an OAuth row exists during the authorize flow before tokens
 *  arrive. One row per connection. */
export const mcpCredentials = pgTable(
  "mcp_credentials",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    mcpConnectionId: text("mcp_connection_id").notNull().references(() => mcpConnections.id, { onDelete: "cascade" }),
    authType: mcpAuthTypeEnum("auth_type").notNull(),
    /** encryptJson({ accessToken, refreshToken?, expiresAt? } | { token }). NEVER store plaintext. */
    secret: text("secret"),
    /** OAuth machinery state (non-secret-ish, but kept server-side only):
     *  { clientInfo?, codeVerifier?, pendingState?, resourceUrl? }. */
    clientRegistration: jsonb("client_registration").$type<{
      clientInfo?: Record<string, unknown>;
      codeVerifier?: string;
      pendingState?: string;
      resourceUrl?: string;
    }>(),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("mcp_credentials_connection_idx").on(table.mcpConnectionId)]
);

/** Per-connection × tool: enabled toggle + permission-class override (D5/D6). */
export const mcpToolPrefs = pgTable(
  "mcp_tool_prefs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    mcpConnectionId: text("mcp_connection_id").notNull().references(() => mcpConnections.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    permClassOverride: mcpToolPermEnum("perm_class_override"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("mcp_tool_prefs_connection_tool_idx").on(table.mcpConnectionId, table.toolName)]
);
