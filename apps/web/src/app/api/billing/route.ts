import { NextResponse } from "next/server";
import { requireCompanyAccess, requireRole, getCompanyPlan, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { db, companies, scenarios, exportLogs, users } from "@burnless/db";
import { eq, and, gte, count, isNull } from "drizzle-orm";
import { getPlan } from "@burnless/ai";
import { getCreditStatus } from "@/lib/ai-feature-flags";
import { env } from "@/lib/env";
import {
  getPaymentProvider,
  getProviderByType,
  resolvePlanId,
  isBillingEnabled,
} from "@/lib/payment";
import type { CurrencyCode } from "@burnless/types";

/**
 * Billing API — provider-agnostic subscription management.
 *
 * Routes through the PaymentProvider abstraction (Stripe / Razorpay).
 * The provider is selected based on company currency.
 *
 * GET  /api/billing — Returns current subscription status with real usage
 * POST /api/billing — checkout, portal, cancel, or reactivate
 */

interface SubscriptionStatus {
  plan: "free" | "pro" | "team";
  status: "active" | "trialing" | "past_due" | "canceled" | "paused" | "none";
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  seats: number;
  portalUrl?: string;
  usage: {
    scenarios: { used: number; limit: number };
    aiCredits: { used: number; total: number; remaining: number };
    exports: { used: number; limit: number };
  };
}

export const GET = withErrorHandler(async (_request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const plan = await getCompanyPlan(ctx.companyId);
  const planDef = getPlan(plan);

  // Get real usage counts
  const scenarioRows = await db
    .select({ cnt: count() })
    .from(scenarios)
    .where(and(eq(scenarios.companyId, ctx.companyId), isNull(scenarios.deletedAt)));
  const scenarioCount = scenarioRows[0]?.cnt ?? 0;

  const creditStatus = await getCreditStatus(ctx.companyId, plan);

  // Monthly exports
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const exportRows = await db
    .select({ cnt: count() })
    .from(exportLogs)
    .where(
      and(
        eq(exportLogs.companyId, ctx.companyId),
        gte(exportLogs.createdAt, monthStart)
      )
    );
  const exportCount = exportRows[0]?.cnt ?? 0;

  // Get subscription status via provider abstraction
  let status: SubscriptionStatus["status"] = "none";
  let currentPeriodEnd: string | null = null;
  let cancelAtPeriodEnd = false;

  const [company] = await db
    .select({
      billingProvider: companies.billingProvider,
      stripeCustomerId: companies.stripeCustomerId,
      stripeSubscriptionId: companies.stripeSubscriptionId,
      currency: companies.currency,
    })
    .from(companies)
    .where(eq(companies.id, ctx.companyId))
    .limit(1);

  if (company?.stripeSubscriptionId && isBillingEnabled()) {
    try {
      const providerType = (company.billingProvider ?? "stripe") as "stripe" | "razorpay";
      const provider = getProviderByType(providerType);
      const sub = await provider.getSubscription(company.stripeSubscriptionId);
      if (sub) {
        status = sub.status;
        currentPeriodEnd = sub.currentPeriodEnd.toISOString();
        cancelAtPeriodEnd = sub.cancelAtPeriodEnd;
      }
    } catch {
      // Subscription may have been deleted externally
      status = "none";
    }
  } else if (plan !== "free") {
    status = "active";
  }

  const subscription: SubscriptionStatus = {
    plan,
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    seats: 1,
    usage: {
      scenarios: {
        used: scenarioCount,
        limit: planDef.maxScenarios === Infinity ? -1 : planDef.maxScenarios,
      },
      aiCredits: {
        used: creditStatus.used,
        total: creditStatus.total,
        remaining: creditStatus.remaining,
      },
      exports: {
        used: exportCount,
        limit: planDef.maxExports === Infinity ? -1 : planDef.maxExports,
      },
    },
  };

  return NextResponse.json(subscription);
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  if (!isBillingEnabled()) {
    return errorResponse(
      "No billing provider configured. Set Stripe or Razorpay credentials.",
      503
    );
  }

  try {
    const body = await request.json();
    const action: string = body.action ?? "checkout";

    // Resolve which provider this company uses
    const [company] = await db
      .select({
        billingProvider: companies.billingProvider,
        stripeCustomerId: companies.stripeCustomerId,
        stripeSubscriptionId: companies.stripeSubscriptionId,
        currency: companies.currency,
      })
      .from(companies)
      .where(eq(companies.id, ctx.companyId))
      .limit(1);

    const currency = (company?.currency ?? "USD") as CurrencyCode;
    const provider = getPaymentProvider(currency);

    // ----------------------------------------------------------------
    // Action: portal — open self-service billing portal
    // ----------------------------------------------------------------
    if (action === "portal") {
      if (!company?.stripeCustomerId) {
        return errorResponse("No billing account found. Subscribe to a plan first.", 400);
      }

      const portal = await provider.createPortalSession(
        company.stripeCustomerId,
        `${env.APP_URL}/settings?tab=billing`
      );

      if (!portal) {
        return errorResponse("Self-service portal not available for your billing provider.", 400);
      }

      return NextResponse.json({ url: portal.url });
    }

    // ----------------------------------------------------------------
    // Action: cancel — schedule cancellation at period end
    // ----------------------------------------------------------------
    if (action === "cancel") {
      if (!company?.stripeSubscriptionId) {
        return errorResponse("No active subscription to cancel.", 400);
      }

      await provider.cancelSubscription(company.stripeSubscriptionId, true);

      const sub = await provider.getSubscription(company.stripeSubscriptionId);
      return NextResponse.json({
        cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? true,
        currentPeriodEnd: sub?.currentPeriodEnd.toISOString() ?? null,
      });
    }

    // ----------------------------------------------------------------
    // Action: reactivate — undo scheduled cancellation
    // ----------------------------------------------------------------
    if (action === "reactivate") {
      if (!company?.stripeSubscriptionId) {
        return errorResponse("No subscription to reactivate.", 400);
      }

      await provider.reactivateSubscription(company.stripeSubscriptionId);

      const sub = await provider.getSubscription(company.stripeSubscriptionId);
      return NextResponse.json({ cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false });
    }

    // ----------------------------------------------------------------
    // Action: checkout (default) — create checkout session
    // ----------------------------------------------------------------
    const { plan } = body;
    if (!plan || !["pro", "team"].includes(plan)) {
      return errorResponse("Invalid plan. Choose 'pro' or 'team'.", 400);
    }

    const planId = resolvePlanId(provider.type, plan);
    if (!planId) {
      return errorResponse(`Price not configured for plan: ${plan}`, 503);
    }

    // Ensure company has a billing customer
    let customerId = company?.stripeCustomerId;
    if (!customerId) {
      const [user] = await db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1);

      if (!user?.email) {
        return errorResponse("User email not found", 500);
      }

      const customer = await provider.createCustomer(
        user.email,
        user.name,
        currency,
      );
      customerId = customer.id;

      // Persist the customer ID and provider
      await db
        .update(companies)
        .set({
          stripeCustomerId: customerId,
          billingProvider: provider.type,
        })
        .where(eq(companies.id, ctx.companyId));
    }

    const session = await provider.createCheckout({
      customerId,
      planId,
      successUrl: `${env.APP_URL}/settings?tab=billing&billing=success`,
      cancelUrl: `${env.APP_URL}/settings?tab=billing&billing=canceled`,
      currency,
      metadata: { companyId: ctx.companyId, userId: ctx.userId },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Billing error";
    return errorResponse(message, 500);
  }
});
