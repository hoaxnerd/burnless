import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listApiTokensForUser,
  mintApiToken,
  roleScopeCap,
  type ApiTokenRow,
  type McpScope,
} from "@burnless/db";
import {
  withErrorHandler,
  requireCompanyAccess,
  parseBody,
  errorResponse,
} from "@/lib/api-helpers";

/** Public DTO — NEVER includes tokenHash (spec §5.5: hashes never leave the db layer). */
function toDto(row: ApiTokenRow) {
  return {
    id: row.id,
    name: row.name,
    lastFour: row.lastFour,
    scopes: row.scopes,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}

// ── GET /api/tokens — the caller's active PATs in the active company ────────

export const GET = withErrorHandler(async () => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const rows = await listApiTokensForUser(ctx.companyId, ctx.userId);
  return NextResponse.json(rows.map(toDto));
});

// ── POST /api/tokens — mint (plaintext returned ONCE) ───────────────────────

const mintSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(["read", "write", "delete"])).min(1).max(3),
  /** Days until expiry; null/absent = never expires (spec §5.1). */
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
});

// AUTHZ note: any member may mint (spec §5.1) — write authority is enforced
// per-scope via roleScopeCap below, NOT via requireRole. The token is a
// self-scoped credential acting as the caller. Allowlisted in
// every-mutation-route-requires-role.test.ts with this rationale.
export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const parsed = await parseBody(request, mintSchema);
  if ("error" in parsed) return parsed.error;

  const cap = roleScopeCap(ctx.role);
  const scopes = [...new Set(parsed.data.scopes)] as McpScope[];
  const overCap = scopes.filter((s) => !cap.includes(s));
  if (overCap.length > 0) {
    return errorResponse(
      `Your role (${ctx.role}) cannot mint scopes: ${overCap.join(", ")}`,
      403
    );
  }

  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const { row, plaintext } = await mintApiToken({
    userId: ctx.userId,
    companyId: ctx.companyId,
    name: parsed.data.name,
    scopes,
    expiresAt,
  });

  // `token` is shown exactly once — only its hash exists at rest (spec §5.1).
  return NextResponse.json({ token: plaintext, ...toDto(row) }, { status: 201 });
});
