import { NextResponse } from "next/server";
import { getDecryptedIntegrationSecret } from "@burnless/db";
import {
  requireCompanyAccess,
  requireRole,
  errorResponse,
  withErrorHandler,
  requirePlanFeature,
} from "@/lib/api-helpers";
import { requireCapability, getCapabilities } from "@/lib/capabilities";
import { integrationRegistry, registerConnectors } from "@/lib/integrations/registry";

// ── POST /api/integrations/[type]/test ──────────────────────────────────────
// Re-validate the STORED (decrypted) key via the connector's credentialSpec
// WITHOUT writing anything. NEVER logs the key.
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

    const secret = await getDecryptedIntegrationSecret(ctx.companyId, type as never);
    if (!secret) return errorResponse("No stored credentials for this integration", 404);

    const result = await connector.credentialSpec.validate({ apiKey: secret.apiKey });
    if (!result.ok) return errorResponse(result.error, 400);

    return NextResponse.json({ ok: true, livemode: result.livemode });
  },
);
