import { NextResponse } from "next/server";
import {
  getVisibleConnection,
  getMcpCredentialsRow,
  saveMcpCredentials,
} from "@burnless/db";
import { createDbBackedProvider, beginOAuth } from "@burnless/mcp";
import { withErrorHandler, requireCompanyAccess, requireRole } from "@/lib/api-helpers";
import { dbOAuthPersistence } from "@/lib/mcp/oauth-persistence";
import { env } from "@/lib/env";

type Params = { params: Promise<{ id: string }> };

/** Begin OAuth: discovery → DCR → PKCE; returns the URL to open in the browser.
 *  State = "<connectionId>.<random>" so the callback can locate the connection,
 *  with the full value persisted server-side and compared on return (CSRF). */
export const POST = withErrorHandler(async (_req: Request, { params }: Params) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id } = await params;
  const row = await getVisibleConnection(id, ctx.companyId, ctx.userId);
  if (!row) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  if (row.transport !== "streamable_http") {
    return NextResponse.json(
      { error: "OAuth applies to remote (HTTP) servers only — stdio uses env credentials" },
      { status: 400 }
    );
  }

  const state = `${id}.${crypto.randomUUID()}`;
  const existing = await getMcpCredentialsRow(id);
  await saveMcpCredentials(id, "oauth", null, {
    ...existing?.clientRegistration,
    pendingState: state,
    resourceUrl: row.endpoint,
  });

  const redirectUrl = `${env.APP_URL}/api/mcp/oauth/callback`;
  const provider = createDbBackedProvider({
    serverUrl: row.endpoint,
    redirectUrl,
    persistence: dbOAuthPersistence(id),
  });
  const authorizationUrl = await beginOAuth(provider, row.endpoint);
  authorizationUrl.searchParams.set("state", state);

  return NextResponse.json({ authorizationUrl: authorizationUrl.href });
});
