import { NextResponse } from "next/server";
import { revokeOauthGrant } from "@burnless/db";
import { withErrorHandler, requireCompanyAccess, errorResponse } from "@/lib/api-helpers";

// AUTHZ note: revokes the caller's OWN grant only (revokeOauthGrant is
// userId-scoped) — allowlisted in every-mutation-route-requires-role.test.ts.
export const DELETE = withErrorHandler(
  async (_request: Request, { params }: { params: Promise<{ grantId: string }> }) => {
    const ctx = await requireCompanyAccess();
    if ("error" in ctx) return ctx.error;
    const { grantId } = await params;
    const revoked = await revokeOauthGrant(grantId, ctx.companyId, ctx.userId);
    if (!revoked) return errorResponse("Grant not found", 404);
    return NextResponse.json({ success: true });
  }
);
