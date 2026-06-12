import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import {
  getVisibleConnection,
  updateMcpConnection,
  deleteMcpConnection,
} from "@burnless/db";
import { getMcpConnectionManager } from "@burnless/mcp";
import {
  withErrorHandler,
  requireCompanyAccess,
  requireRole,
  parseBody,
} from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_req: Request, { params }: Params) => {
    const ctx = await requireCompanyAccess();
    if ("error" in ctx) return ctx.error;
    const { id } = await params;
    const row = await getVisibleConnection(id, ctx.companyId, ctx.userId);
    if (!row)
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    return NextResponse.json(row);
  }
);

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  // user can disable/re-enable; other states are system-set
  status: z.enum(["disabled", "pending"]).optional(),
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

    const updated = await updateMcpConnection(id, ctx.companyId, parsed.data);
    revalidateTag("mcp-connections", { expire: 0 });
    return NextResponse.json(updated ?? row);
  }
);

export const DELETE = withErrorHandler(
  async (_req: Request, { params }: Params) => {
    const ctx = await requireCompanyAccess();
    if ("error" in ctx) return ctx.error;
    const roleErr = requireRole(ctx, "editor");
    if (roleErr) return roleErr;
    const { id } = await params;
    const row = await getVisibleConnection(id, ctx.companyId, ctx.userId);
    if (!row)
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });

    await getMcpConnectionManager().invalidate(id);
    await deleteMcpConnection(id, ctx.companyId);
    revalidateTag("mcp-connections", { expire: 0 });
    return NextResponse.json({ deleted: true });
  }
);
