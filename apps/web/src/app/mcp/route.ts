/**
 * ${APP_URL}/mcp — the exposed MCP endpoint (expose spec §4.1/§4.3).
 * Request flow: bearer auth (401 + PRM pointer) → kill switch (403) →
 * session resolve + dispatch via the web-free bridge in packages/mcp.
 * JSON-response mode; GET 405; DELETE terminates the session.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, companies } from "@burnless/db";
import {
  createBurnlessMcpServer,
  getMcpSessionManager,
  handleMcpHttpRequest,
} from "@burnless/mcp/server";
import { verifyMcpBearer, mcpUnauthorizedResponse } from "@/lib/mcp-server/auth";
import { buildMcpExecuteTool, getExposedMcpToolDefs } from "@/lib/mcp-server/tools";
import { buildMcpReadResource, MCP_RESOURCES } from "@/lib/mcp-server/resources";

export const runtime = "nodejs";

async function handle(request: Request): Promise<Response> {
  // Step 1 (spec §4.3): bearer auth — both PAT and OAuth via one verifier.
  const auth = await verifyMcpBearer(request.headers.get("authorization"));
  if (!auth) return mcpUnauthorizedResponse();

  // Step 3: company kill switch (B8). Tokens stay intact — just 403.
  const [company] = await db
    .select({ mcpServerEnabled: companies.mcpServerEnabled })
    .from(companies)
    .where(eq(companies.id, auth.companyId))
    .limit(1);
  if (!company || !company.mcpServerEnabled) {
    return NextResponse.json(
      { error: "MCP server access is disabled for this company" },
      { status: 403 }
    );
  }

  // Steps 4-7: session resolve, scope gate, dispatch, audit — inside the
  // bridge + the injected closures.
  return handleMcpHttpRequest(request, {
    sessions: getMcpSessionManager(),
    credentialKey: `${auth.credentialType}:${auth.credentialId}`,
    scopes: auth.scopes,
    buildServer: async (state, clientInfo) =>
      createBurnlessMcpServer({
        // TODO(A3b): pass companyId so a future per-company-gated non-core domain's advertised MCP tool list matches the executable set (buildMcpExecuteTool already passes companyId). Byte-identical today: finance is core/always-enabled.
        tools: await getExposedMcpToolDefs(),
        resources: MCP_RESOURCES,
        executeTool: await buildMcpExecuteTool({ auth, state, clientInfo }),
        readResource: buildMcpReadResource({ auth, state }),
        serverInfo: { name: "burnless", version: "1.0.0" },
      }),
  });
}

export const POST = handle;
export const DELETE = handle;
export const GET = handle; // bridge answers 405 (spec §4.1)
