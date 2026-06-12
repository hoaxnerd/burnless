import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  getVisibleConnection,
  getMcpCredentialsRow,
  saveMcpCredentials,
  updateMcpConnection,
  getDecryptedMcpSecret,
} from "@burnless/db";
import { createDbBackedProvider, completeOAuth, getMcpConnectionManager } from "@burnless/mcp";
import { withErrorHandler, requireCompanyAccess } from "@/lib/api-helpers";
import { dbOAuthPersistence } from "@/lib/mcp/oauth-persistence";
import { probeConnection, specFromRow } from "@/lib/mcp/probe";
import { env } from "@/lib/env";

/** Browser redirect target. Validates state, exchanges the code, probes, then
 *  bounces the user back to /connections. Errors land as ?error= for the UI. */
export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const back = (q: string) => NextResponse.redirect(`${env.APP_URL}/connections?${q}`);

  if (!code || !state || !state.includes(".")) return back("error=missing_code_or_state");
  const connectionId = state.split(".")[0]!;

  const row = await getVisibleConnection(connectionId, ctx.companyId, ctx.userId);
  if (!row) return back("error=unknown_connection");

  const creds = await getMcpCredentialsRow(connectionId);
  if (creds?.clientRegistration?.pendingState !== state) return back("error=state_mismatch");

  const provider = createDbBackedProvider({
    serverUrl: row.endpoint,
    redirectUrl: `${env.APP_URL}/api/mcp/oauth/callback`,
    persistence: dbOAuthPersistence(connectionId),
  });

  try {
    await completeOAuth(provider, row.endpoint, code);
  } catch {
    await updateMcpConnection(connectionId, ctx.companyId, {
      status: "needs_auth",
      lastError: "OAuth code exchange failed",
    });
    return back("error=exchange_failed");
  }

  // Clear the one-time state, then probe with the fresh token.
  const after = await getMcpCredentialsRow(connectionId);
  await saveMcpCredentials(connectionId, "oauth", null, {
    ...after?.clientRegistration,
    pendingState: undefined,
  });
  await getMcpConnectionManager().invalidate(connectionId);

  const secret = await getDecryptedMcpSecret(connectionId);
  const probe = await probeConnection(specFromRow({ ...row, authType: "oauth" }), secret);
  await updateMcpConnection(connectionId, ctx.companyId, {
    authType: "oauth",
    status: probe.status,
    capabilities: probe.status === "connected" ? { tools: probe.tools } : row.capabilities,
    lastError: probe.error,
    lastConnectedAt: probe.status === "connected" ? new Date() : null,
  });

  revalidateTag("mcp-connections", { expire: 0 });
  return back(
    probe.status === "connected"
      ? `connected=${row.slug}`
      : "error=connected_but_unauthorized"
  );
});
