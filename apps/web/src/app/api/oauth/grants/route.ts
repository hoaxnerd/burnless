/**
 * Connected-apps list (expose spec §5.2 revocation UX): the OAuth grants of
 * the calling user in the active company.
 */
import { NextResponse } from "next/server";
import { listOauthGrantsForUser } from "@burnless/db";
import { withErrorHandler, requireCompanyAccess } from "@/lib/api-helpers";

export const GET = withErrorHandler(async () => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const grants = await listOauthGrantsForUser(ctx.companyId, ctx.userId);
  return NextResponse.json(grants);
});
