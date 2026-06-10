import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import {
  getVisibleConnection,
  saveMcpCredentials,
  updateMcpConnection,
  getDecryptedMcpSecret,
} from "@burnless/db";
import { getMcpConnectionManager } from "@burnless/mcp";
import {
  withErrorHandler,
  requireCompanyAccess,
  requireRole,
  parseBody,
} from "@/lib/api-helpers";
import { probeConnection, specFromRow } from "@/lib/mcp/probe";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ token: z.string().min(1).max(4000) });

/** Store/replace a PAT (encrypted at rest), then re-probe. Token is never echoed back. */
export const POST = withErrorHandler(
  async (request: Request, { params }: Params) => {
    const ctx = await requireCompanyAccess();
    if ("error" in ctx) return ctx.error;
    const roleErr = requireRole(ctx, "editor");
    if (roleErr) return roleErr;
    const { id } = await params;
    const row = await getVisibleConnection(id, ctx.companyId, ctx.userId);
    if (!row)
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });

    const parsed = await parseBody(request, bodySchema);
    if ("error" in parsed) return parsed.error;

    await saveMcpCredentials(id, "pat", { token: parsed.data.token });
    await getMcpConnectionManager().invalidate(id); // drop any unauthenticated cached client

    const secret = await getDecryptedMcpSecret(id);
    const probe = await probeConnection(specFromRow({ ...row, authType: "pat" }), secret);
    const updated = await updateMcpConnection(id, ctx.companyId, {
      authType: "pat",
      status: probe.status,
      capabilities:
        probe.status === "connected"
          ? { tools: probe.tools }
          : row.capabilities,
      lastError: probe.error,
      lastConnectedAt: probe.status === "connected" ? new Date() : null,
    });

    revalidateTag("mcp-connections");
    return NextResponse.json({
      id: updated?.id,
      status: updated?.status,
      authType: updated?.authType,
    });
  }
);
