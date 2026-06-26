import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, integrations, saveIntegrationCredentials } from "@burnless/db";
import {
  requireCompanyAccess,
  requireRole,
  parseBody,
  errorResponse,
  withErrorHandler,
  requirePlanFeature,
} from "@/lib/api-helpers";
import { requireCapability, getCapabilities } from "@/lib/capabilities";
import { integrationRegistry, registerConnectors } from "@/lib/integrations/registry";
import { runIntegrationSync, type IntegrationMetadata } from "@/lib/integrations/sync";
import { logger } from "@/lib/logger";
import { connectSchema } from "./schemas";

const log = logger("integrations/connect");

// ── POST /api/integrations/[type]/connect ───────────────────────────────────
// Validate a pasted API key via the connector's credentialSpec, encrypt+store it,
// and upsert the integrations row to status:"active". NEVER logs the key.
export const POST = withErrorHandler(
  async (request: Request, { params }: { params: Promise<{ type: string }> }) => {
    const ctx = await requireCompanyAccess();
    if ("error" in ctx) return ctx.error;
    const roleErr = requireRole(ctx, "admin");
    if (roleErr) return roleErr;
    const capErr = requireCapability("integrations");
    if (capErr) return capErr;
    // Plan gate ONLY where plan enforcement is on (cloud). Self-host (just enabled)
    // must not be blocked — requirePlanFeature would still run a plan check there.
    if (getCapabilities().planEnforcement) {
      const gate = await requirePlanFeature(ctx.companyId, "custom_integrations");
      if (gate) return gate;
    }

    const { type } = await params;
    registerConnectors();
    const connector = integrationRegistry.get(type);
    if (!connector) return errorResponse("Unknown integration", 404);

    const parsed = await parseBody(request, connectSchema);
    if ("error" in parsed) return parsed.error;

    const result = await connector.credentialSpec.validate({ apiKey: parsed.data.apiKey });
    if (!result.ok) return errorResponse(result.error, 400);

    await saveIntegrationCredentials(
      ctx.companyId,
      type as never,
      { apiKey: parsed.data.apiKey },
      { livemode: result.livemode, metadata: result.meta },
    );

    const [existing] = await db
      .select()
      .from(integrations)
      .where(and(eq(integrations.companyId, ctx.companyId), eq(integrations.type, type as never)))
      .limit(1);

    // Metadata is one coherent shape: { livemode, sync? }. Connect owns `livemode`;
    // an actual SYNC owns `lastSyncAt` + `metadata.sync`. Merge so a re-connect
    // never clobbers existing sync state, and never set lastSyncAt here (connecting
    // is not syncing).
    const prevMeta: IntegrationMetadata =
      (existing?.metadata as IntegrationMetadata | null) ?? {};
    const metadata: IntegrationMetadata = { ...prevMeta, livemode: result.livemode };

    const row = existing
      ? (
          await db
            .update(integrations)
            .set({ status: "active", metadata })
            .where(eq(integrations.id, existing.id))
            .returning()
        )[0]
      : (
          await db
            .insert(integrations)
            .values({
              companyId: ctx.companyId,
              type: type as never,
              status: "active",
              metadata,
            })
            .returning()
        )[0];

    // Kick off a backfill WITHOUT awaiting so the connect response stays fast.
    // Any failure is surfaced via metadata.sync.lastError (inside runIntegrationSync)
    // and logged here; it must never reject the connect response.
    void runIntegrationSync(ctx.companyId, type, { mode: "backfill" }).catch((e) => {
      log.error({ err: e instanceof Error ? e.message : String(e), type }, "backfill-on-connect failed");
    });

    return NextResponse.json({ ok: true, integration: row });
  },
);
