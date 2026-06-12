import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import {
  getVisibleConnection,
  listMcpToolPrefs,
  upsertMcpToolPref,
} from "@burnless/db";
import { classifyMcpTool } from "@burnless/mcp";
import {
  withErrorHandler,
  requireCompanyAccess,
  requireRole,
  parseBody,
} from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

/** Discovered tools (from cached capabilities) merged with prefs + effective class. */
export const GET = withErrorHandler(
  async (_req: Request, { params }: Params) => {
    const ctx = await requireCompanyAccess();
    if ("error" in ctx) return ctx.error;
    const { id } = await params;
    const row = await getVisibleConnection(id, ctx.companyId, ctx.userId);
    if (!row)
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });

    const prefs = new Map((await listMcpToolPrefs(id)).map((p) => [p.toolName, p]));
    const tools = (row.capabilities?.tools ?? []).map((t) => {
      const pref = prefs.get(t.name);
      return {
        name: t.name,
        description: t.description ?? null,
        enabled: pref?.enabled ?? true,
        permClass: pref?.permClassOverride ?? classifyMcpTool(t),
        permClassOverride: pref?.permClassOverride ?? null,
      };
    });
    return NextResponse.json(tools);
  }
);

const patchSchema = z.object({
  toolName: z.string().min(1).max(200),
  enabled: z.boolean().optional(),
  permClassOverride: z.enum(["read", "write", "delete"]).nullable().optional(),
});

export const PATCH = withErrorHandler(
  async (request: Request, { params }: Params) => {
    const ctx = await requireCompanyAccess();
    if ("error" in ctx) return ctx.error;
    const roleErr = requireRole(ctx, "editor");
    if (roleErr) return roleErr;
    const { id } = await params;
    const row = await getVisibleConnection(id, ctx.companyId, ctx.userId);
    if (!row)
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });

    const parsed = await parseBody(request, patchSchema);
    if ("error" in parsed) return parsed.error;
    const { toolName, ...patch } = parsed.data;

    const known = (row.capabilities?.tools ?? []).some((t) => t.name === toolName);
    if (!known)
      return NextResponse.json(
        { error: `Unknown tool: ${toolName}` },
        { status: 400 }
      );

    await upsertMcpToolPref(id, toolName, patch);
    revalidateTag("mcp-connections", { expire: 0 });
    return NextResponse.json({ ok: true });
  }
);
