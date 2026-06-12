/**
 * POST /api/browser/install — install the Chromium engine the Playwright MCP
 * server needs (#33, S3a Plan 5 — Task C6). Self-host only.
 *
 * Browser-use is delivered via the Playwright MCP (stdio); this endpoint runs
 * `npx playwright install chromium` so that MCP can actually drive a browser.
 * CSRF + rate-limit (mutation tier) are handled by the global middleware.
 */
import { NextResponse } from "next/server";
import { withErrorHandler, requireCompanyAccess } from "@/lib/api-helpers";
import { getCapabilities } from "@/lib/capabilities";
import { installBrowserEngine } from "@/lib/browser-mcp";

export const POST = withErrorHandler(async () => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  if (!getCapabilities().stdioMcp) {
    return NextResponse.json(
      {
        error: "Browser engine install is self-host only",
        code: "CAPABILITY_DISABLED",
        capability: "stdioMcp",
      },
      { status: 400 }
    );
  }

  const result = await installBrowserEngine();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
});
