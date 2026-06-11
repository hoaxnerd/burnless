import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import {
  listVisibleConnections,
  createMcpConnection,
  updateMcpConnection,
  getDecryptedMcpSecret,
} from "@burnless/db";
import { parseMcpConfig, McpConfigError } from "@burnless/mcp";
import {
  withErrorHandler,
  requireCompanyAccess,
  requireRole,
  parseBody,
} from "@/lib/api-helpers";
import { probeConnection, specFromRow } from "@/lib/mcp/probe";
import { getCapabilities } from "@/lib/capabilities";

export const GET = withErrorHandler(async () => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const rows = await listVisibleConnections(ctx.companyId, ctx.userId);
  return NextResponse.json(rows);
});

const createSchema = z
  .object({
    /** Mode 1: raw pasted JSON config (spec D7). */
    config: z.string().min(2).max(20_000).optional(),
    /** Mode 2: explicit fields (guided form). */
    name: z.string().min(1).max(100).optional(),
    transport: z.enum(["streamable_http", "stdio"]).optional(),
    endpoint: z.string().min(1).max(2000).optional(),
    args: z.array(z.string().max(500)).max(50).optional(),
    env: z.record(z.string().max(2000)).optional(),
    /** Common. */
    ownerScope: z.enum(["company", "personal"]).default("company"),
  })
  .refine((v) => v.config || (v.name && v.transport && v.endpoint), {
    message: "Provide either a pasted config or name+transport+endpoint",
  });

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  // Normalize both entry modes into one server description.
  let server: {
    name: string;
    transport: "streamable_http" | "stdio";
    endpoint: string;
    args?: string[];
    env?: Record<string, string>;
  };

  if (body.config) {
    let servers;
    try {
      servers = parseMcpConfig(body.config);
    } catch (err) {
      if (err instanceof McpConfigError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
    if (servers.length !== 1) {
      return NextResponse.json(
        {
          error: `Config contains ${servers.length} servers — paste exactly one`,
        },
        { status: 400 }
      );
    }
    const s = servers[0]!;
    server = {
      name: s.name,
      transport: s.transport,
      endpoint: s.transport === "streamable_http" ? s.url! : s.command!,
      args: s.args,
      env: s.env,
    };
  } else {
    server = {
      name: body.name!,
      transport: body.transport!,
      endpoint: body.endpoint!,
      args: body.args,
      env: body.env,
    };
  }

  // Deploy-mode gate (spec §3.6): stdio only when the operator allows it.
  if (server.transport === "stdio" && !getCapabilities().stdioMcp) {
    return NextResponse.json(
      {
        error:
          "Local (stdio) MCP servers are not available on this deployment",
      },
      { status: 403 }
    );
  }

  const row = await createMcpConnection({
    companyId: ctx.companyId,
    ownerScope: body.ownerScope,
    ownerUserId: body.ownerScope === "personal" ? ctx.userId : null,
    name: server.name,
    transport: server.transport,
    endpoint: server.endpoint,
    args: server.args,
    env: server.env,
    authType: "none",
  });

  // Probe immediately: success caches tools; 401 marks needs_auth (OAuth detect, D8).
  const secret = await getDecryptedMcpSecret(row.id); // null on create — kept for symmetry
  const probe = await probeConnection(specFromRow(row), secret);
  const updated = await updateMcpConnection(row.id, ctx.companyId, {
    status: probe.status,
    authType: probe.status === "needs_auth" ? "oauth" : row.authType,
    capabilities:
      probe.status === "connected" ? { tools: probe.tools } : row.capabilities,
    lastError: probe.error,
    lastConnectedAt: probe.status === "connected" ? new Date() : null,
  });

  revalidateTag("mcp-connections");
  return NextResponse.json(updated ?? row, { status: 201 });
});
