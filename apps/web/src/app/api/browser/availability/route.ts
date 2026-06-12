/**
 * GET /api/browser/availability — whether AI browser-use is usable right now
 * (S3b Task 4). Returns `{ connected, chromiumInstalled }` from
 * `isBrowserUseAvailable`. The endpoint stays callable on every edition; cloud
 * vs self-host visibility of the browser row is a UI concern, not enforced here.
 */
import { NextResponse } from "next/server";
import { withErrorHandler, requireCompanyAccess } from "@/lib/api-helpers";
import { isBrowserUseAvailable } from "@/lib/browser-mcp";

export const GET = withErrorHandler(async () => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  return NextResponse.json(await isBrowserUseAvailable(ctx.companyId, ctx.userId));
});
