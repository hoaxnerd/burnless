import { NextResponse } from "next/server";
import {
  requireCompanyAccess,
  requireRole,
  errorResponse,
  withErrorHandler,
  requirePlanFeature,
} from "@/lib/api-helpers";
import { requireCapability, getCapabilities } from "@/lib/capabilities";
import { integrationRegistry, registerConnectors } from "@/lib/integrations/registry";
import { runIntegrationSync } from "@/lib/integrations/sync";

// ── POST /api/integrations/[type]/sync ───────────────────────────────────────
// Manually trigger an INCREMENTAL inbound sync (uses the stored cursor). Gated
// exactly like /connect: company access → admin → capability("integrations")
// → (cloud-only) plan feature. NEVER logs credentials.
export const POST = withErrorHandler(
  async (_request: Request, { params }: { params: Promise<{ type: string }> }) => {
    const ctx = await requireCompanyAccess();
    if ("error" in ctx) return ctx.error;
    const roleErr = requireRole(ctx, "admin");
    if (roleErr) return roleErr;
    const capErr = requireCapability("integrations");
    if (capErr) return capErr;
    // Plan gate ONLY where plan enforcement is on (cloud). Self-host must not be blocked.
    if (getCapabilities().planEnforcement) {
      const gate = await requirePlanFeature(ctx.companyId, "custom_integrations");
      if (gate) return gate;
    }

    const { type } = await params;
    registerConnectors();
    const connector = integrationRegistry.get(type);
    if (!connector) return errorResponse("Unknown integration", 404);

    const result = await runIntegrationSync(ctx.companyId, type, { mode: "incremental" });
    return NextResponse.json({ ok: true, ...result });
  },
);
