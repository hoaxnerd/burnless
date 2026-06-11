import { NextResponse } from "next/server";
import { revokeApiToken } from "@burnless/db";
import {
  withErrorHandler,
  requireCompanyAccess,
  errorResponse,
} from "@/lib/api-helpers";

// ── DELETE /api/tokens/[id] — revoke (instant, spec §5.1) ───────────────────

// AUTHZ note: revokes the caller's OWN token only (revokeApiToken is
// userId-scoped) — no requireRole needed; allowlisted in
// every-mutation-route-requires-role.test.ts.
export const DELETE = withErrorHandler(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireCompanyAccess();
    if ("error" in ctx) return ctx.error;
    const { id } = await params;
    const revoked = await revokeApiToken(id, ctx.companyId, ctx.userId);
    if (!revoked) return errorResponse("Token not found", 404);
    return NextResponse.json({ success: true });
  }
);
