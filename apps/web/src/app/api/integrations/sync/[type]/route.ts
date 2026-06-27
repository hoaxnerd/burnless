import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
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

// ── POST /api/integrations/sync/[type] ───────────────────────────────────────
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

    // Invalidate cached surfaces when a sync inserted rows. This route has a
    // request context (unlike the fire-and-forget backfill-on-connect), so
    // revalidateTag is safe here. `accounts` — a "Payment processing fees" account
    // may have been find-or-created; `expense-details` — the server-rendered
    // expense/transaction table. trackDataMutation already fired inside the sync.
    // Wrapped defensively so a revalidation hiccup never fails the sync response.
    if (result.inserted > 0) {
      try {
        revalidateTag("accounts", { expire: 0 });
        revalidateTag("expense-details", { expire: 0 });
      } catch {
        /* never fail the sync because revalidation threw */
      }
    }

    return NextResponse.json({ ok: true, ...result });
  },
);
