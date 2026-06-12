/**
 * MCP connection / credential / tool-pref queries (spec §3.3).
 * Visibility rule: company-scoped rows are visible to all members; personal
 * rows only to their owner. Always filter by companyId.
 */
import { and, eq, or } from "drizzle-orm";
import { db } from "../index";
import {
  mcpConnections,
  mcpCredentials,
  mcpToolPrefs,
  userPreferences,
} from "../schema";
import { encryptJson, decryptJson } from "../crypto";

export type McpSecret =
  | { accessToken: string; refreshToken?: string; expiresAt?: string }
  | { token: string };

export type McpConnectionRow = typeof mcpConnections.$inferSelect;
export type McpToolPrefRow = typeof mcpToolPrefs.$inferSelect;

/** "Stripe Billing" → "stripe-billing". Used for the tool namespace. */
export function slugifyConnectionName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug)
    throw new Error(
      "Connection name must contain at least one alphanumeric character"
    );
  return slug;
}

function visibleWhere(companyId: string, userId: string) {
  return and(
    eq(mcpConnections.companyId, companyId),
    or(
      eq(mcpConnections.ownerScope, "company"),
      eq(mcpConnections.ownerUserId, userId)
    )
  );
}

export async function listVisibleConnections(
  companyId: string,
  userId: string
): Promise<McpConnectionRow[]> {
  return db
    .select()
    .from(mcpConnections)
    .where(visibleWhere(companyId, userId));
}

export async function getVisibleConnection(
  id: string,
  companyId: string,
  userId: string
): Promise<McpConnectionRow | null> {
  const rows = await db
    .select()
    .from(mcpConnections)
    .where(and(eq(mcpConnections.id, id), visibleWhere(companyId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createMcpConnection(data: {
  companyId: string;
  ownerScope: "company" | "personal";
  ownerUserId: string | null;
  name: string;
  transport: "streamable_http" | "stdio";
  endpoint: string;
  args?: string[];
  env?: Record<string, string>;
  authType: "oauth" | "pat" | "none";
}): Promise<McpConnectionRow> {
  if (data.ownerScope === "personal" && !data.ownerUserId) {
    throw new Error("Personal connections require ownerUserId");
  }
  const [row] = await db
    .insert(mcpConnections)
    .values({ ...data, slug: slugifyConnectionName(data.name) })
    .returning();
  return row!;
}

export async function updateMcpConnection(
  id: string,
  companyId: string,
  patch: Partial<
    Pick<
      McpConnectionRow,
      | "name"
      | "status"
      | "capabilities"
      | "lastError"
      | "lastConnectedAt"
      | "authType"
      | "ownerScope"
      | "ownerUserId"
    >
  >
): Promise<McpConnectionRow | null> {
  const values: Record<string, unknown> = { ...patch };
  if (patch.name) values.slug = slugifyConnectionName(patch.name);
  const rows = await db
    .update(mcpConnections)
    .set(values)
    .where(
      and(
        eq(mcpConnections.id, id),
        eq(mcpConnections.companyId, companyId)
      )
    )
    .returning();
  return rows[0] ?? null;
}

export async function deleteMcpConnection(
  id: string,
  companyId: string
): Promise<boolean> {
  const rows = await db
    .delete(mcpConnections)
    .where(
      and(
        eq(mcpConnections.id, id),
        eq(mcpConnections.companyId, companyId)
      )
    )
    .returning({ id: mcpConnections.id });
  return rows.length > 0;
}

/** Upsert the single credentials row for a connection. Secret is encrypted here —
 *  callers NEVER pass pre-encrypted blobs and NEVER read `secret` directly. */
export async function saveMcpCredentials(
  mcpConnectionId: string,
  authType: "oauth" | "pat",
  secret: McpSecret | null,
  clientRegistration?: {
    clientInfo?: Record<string, unknown>;
    codeVerifier?: string;
    pendingState?: string;
    resourceUrl?: string;
  }
): Promise<void> {
  const encrypted = secret === null ? null : encryptJson(secret);
  const expiresAt =
    secret && "expiresAt" in secret && secret.expiresAt
      ? new Date(secret.expiresAt)
      : null;
  await db
    .insert(mcpCredentials)
    .values({
      mcpConnectionId,
      authType,
      secret: encrypted,
      clientRegistration,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: mcpCredentials.mcpConnectionId,
      set: {
        authType,
        ...(secret !== null ? { secret: encrypted, expiresAt } : {}),
        ...(clientRegistration !== undefined ? { clientRegistration } : {}),
      },
    });
}

export async function getMcpCredentialsRow(mcpConnectionId: string) {
  const rows = await db
    .select()
    .from(mcpCredentials)
    .where(eq(mcpCredentials.mcpConnectionId, mcpConnectionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getDecryptedMcpSecret(
  mcpConnectionId: string
): Promise<McpSecret | null> {
  const row = await getMcpCredentialsRow(mcpConnectionId);
  if (!row?.secret) return null;
  return decryptJson<McpSecret>(row.secret);
}

export async function listMcpToolPrefs(
  mcpConnectionId: string
): Promise<McpToolPrefRow[]> {
  return db
    .select()
    .from(mcpToolPrefs)
    .where(eq(mcpToolPrefs.mcpConnectionId, mcpConnectionId));
}

export async function upsertMcpToolPref(
  mcpConnectionId: string,
  toolName: string,
  patch: {
    enabled?: boolean;
    permClassOverride?: "read" | "write" | "delete" | null;
  }
): Promise<void> {
  await db
    .insert(mcpToolPrefs)
    .values({
      mcpConnectionId,
      toolName,
      enabled: patch.enabled ?? true,
      permClassOverride: patch.permClassOverride ?? null,
    })
    .onConflictDoUpdate({
      target: [mcpToolPrefs.mcpConnectionId, mcpToolPrefs.toolName],
      set: {
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.permClassOverride !== undefined
          ? { permClassOverride: patch.permClassOverride }
          : {}),
      },
    });
}

/** D11: connection ids this user has switched off in the AI sidebar. */
export async function getDisabledMcpConnectionIds(
  userId: string,
  companyId: string
): Promise<string[]> {
  const rows = await db
    .select({ disabled: userPreferences.disabledMcpConnections })
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.companyId, companyId)
      )
    )
    .limit(1);
  return rows[0]?.disabled ?? [];
}

/** S3b: built-in tool ids this user has switched off in the Tools pane. */
export async function getDisabledBuiltinTools(
  userId: string,
  companyId: string
): Promise<string[]> {
  const rows = await db
    .select({ disabled: userPreferences.disabledBuiltinTools })
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.companyId, companyId)
      )
    )
    .limit(1);
  return rows[0]?.disabled ?? [];
}

export interface UserPreferencesPatch {
  sidebarOrder?: string[] | null;
  quickActionMode?: "intelligence" | "dynamic" | "custom";
  quickActionModeOverrides?:
    | Record<string, "intelligence" | "dynamic" | "custom">
    | null;
  customQuickActions?: string[] | null;
  sidebarCollapsed?: boolean;
  /** D11: per-user MCP kill-switch — connection ids excluded from AI context. */
  disabledMcpConnections?: string[];
  /** S3b: per-user built-in-tool kill-switch — tool names excluded from AI context. */
  disabledBuiltinTools?: string[];
}

/**
 * Atomic upsert of a user's preferences for a company. `set: patch` only updates
 * provided keys, so partial-patch semantics are preserved (unset columns keep
 * their stored value). The unique (userId, companyId) index makes this a single
 * collision-free statement.
 */
export async function upsertUserPreferences(
  userId: string,
  companyId: string,
  patch: UserPreferencesPatch
): Promise<typeof userPreferences.$inferSelect> {
  const [row] = await db
    .insert(userPreferences)
    .values({ userId, companyId, ...patch })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.companyId],
      set: patch,
    })
    .returning();
  return row!;
}
