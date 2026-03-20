import { NextResponse } from "next/server";
import type StripeType from "stripe";
import { requireCompanyAccess, requireRole, getCompanyPlan, errorResponse } from "@/lib/api-helpers";
import { db, companies, scenarios, aiMessages, aiConversations } from "@burnless/db";
import { eq, and, gte, count } from "drizzle-orm";
import { getPlanLimits } from "@/lib/feature-gate";
import { env } from "@/lib/env";

async function getStripe(): Promise<StripeType> {
  const { default: Stripe } = await import("stripe");
  return new Stripe(env.STRIPE_SECRET_KEY!);
}

/**
 * Billing API — manages subscription state and Stripe integration.
 *
 * GET  /api/billing — Returns current subscription status with real usage
 * POST /api/billing — Creates a Stripe Checkout session for upgrading,
 *                      a Customer Portal session, or cancels at period end
 */

interface SubscriptionStatus {
  plan: "free" | "pro" | "team";
  status: "active" | "trialing" | "past_due" | "canceled" | "none";
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  seats: number;
  portalUrl?: string;
  usage: {
    scenarios: { used: number; limit: number };
    aiMessages: { used: number; limit: number };
    exports: { used: number; limit: number };
  };
}

export async function GET() {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const plan = await getCompanyPlan(ctx.companyId);
  const limits = getPlanLimits(plan);

  // Get real usage counts
  const scenarioRows = await db
    .select({ cnt: count() })
    .from(scenarios)
    .where(eq(scenarios.companyId, ctx.companyId));
  const scenarioCount = scenarioRows[0]?.cnt ?? 0;

  // Monthly AI messages
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const aiMessageRows = await db
    .select({ cnt: count() })
    .from(aiMessages)
    .innerJoin(aiConversations, eq(aiMessages.conversationId, aiConversations.id))
    .where(
      and(
        eq(aiConversations.companyId, ctx.companyId),
        eq(aiMessages.role, "user"),
        gte(aiMessages.createdAt, monthStart)
      )
    );
  const aiMessageCount = aiMessageRows[0]?.cnt ?? 0;

  // Get Stripe subscription status if configured
  let status: SubscriptionStatus["status"] = "none";
  let currentPeriodEnd: string | null = null;
  let cancelAtPeriodEnd = false;

  const [company] = await db
    .select({
      stripeCustomerId: companies.stripeCustomerId,
      stripeSubscriptionId: companies.stripeSubscriptionId,
    })
    .from(companies)
    .where(eq(companies.id, ctx.companyId))
    .limit(1);

  if (company?.stripeSubscriptionId && env.STRIPE_SECRET_KEY) {
    try {
      const stripe = await getStripe();
      const sub = await stripe.subscriptions.retrieve(
        company.stripeSubscriptionId
      );
      status = sub.status as SubscriptionStatus["status"];
      const periodEnd = (sub as unknown as { current_period_end: number }).current_period_end;
      currentPeriodEnd = new Date(periodEnd * 1000).toISOString();
      cancelAtPeriodEnd = sub.cancel_at_period_end;
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
        limit: limits.maxScenarios === Infinity ? -1 : limits.maxScenarios,
      },
      aiMessages: {
        used: aiMessageCount,
        limit: limits.maxAiMessages === Infinity ? -1 : limits.maxAiMessages,
      },
      exports: {
        used: 0, // Export tracking can be added later
        limit: limits.maxExports === Infinity ? -1 : limits.maxExports,
      },
    },
  };

  return NextResponse.json(subscription);
}

export async function POST(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  if (!env.STRIPE_SECRET_KEY) {
    return errorResponse(
      "Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing.",
      503
    );
  }

  try {
    const body = await request.json();
    const action: string = body.action ?? "checkout";

    const stripe = await getStripe();

    // ----------------------------------------------------------------
    // Action: portal — open Stripe Customer Portal for self-service
    // ----------------------------------------------------------------
    if (action === "portal") {
      const [company] = await db
        .select({ stripeCustomerId: companies.stripeCustomerId })
        .from(companies)
        .where(eq(companies.id, ctx.companyId))
        .limit(1);

      if (!company?.stripeCustomerId) {
        return errorResponse("No billing account found. Subscribe to a plan first.", 400);
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: company.stripeCustomerId,
        return_url: `${env.APP_URL}/settings?tab=billing`,
      });

      return NextResponse.json({ url: portalSession.url });
    }

    // ----------------------------------------------------------------
    // Action: cancel — schedule cancellation at period end
    // ----------------------------------------------------------------
    if (action === "cancel") {
      const [company] = await db
        .select({ stripeSubscriptionId: companies.stripeSubscriptionId })
        .from(companies)
        .where(eq(companies.id, ctx.companyId))
        .limit(1);

      if (!company?.stripeSubscriptionId) {
        return errorResponse("No active subscription to cancel.", 400);
      }

      const sub = await stripe.subscriptions.update(
        company.stripeSubscriptionId,
        { cancel_at_period_end: true }
      );

      return NextResponse.json({
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodEnd: new Date(
          (sub as unknown as { current_period_end: number }).current_period_end * 1000
        ).toISOString(),
      });
    }

    // ----------------------------------------------------------------
    // Action: reactivate — undo scheduled cancellation
    // ----------------------------------------------------------------
    if (action === "reactivate") {
      const [company] = await db
        .select({ stripeSubscriptionId: companies.stripeSubscriptionId })
        .from(companies)
        .where(eq(companies.id, ctx.companyId))
        .limit(1);

      if (!company?.stripeSubscriptionId) {
        return errorResponse("No subscription to reactivate.", 400);
      }

      const sub = await stripe.subscriptions.update(
        company.stripeSubscriptionId,
        { cancel_at_period_end: false }
      );

      return NextResponse.json({ cancelAtPeriodEnd: sub.cancel_at_period_end });
    }

    // ----------------------------------------------------------------
    // Action: checkout (default) — create Stripe Checkout session
    // ----------------------------------------------------------------
    const { plan } = body;
    if (!plan || !["pro", "team"].includes(plan)) {
      return errorResponse("Invalid plan. Choose 'pro' or 'team'.", 400);
    }

    const priceIds: Record<string, string | undefined> = {
      pro: env.STRIPE_PRO_PRICE_ID,
      team: env.STRIPE_TEAM_PRICE_ID,
    };

    const priceId = priceIds[plan];
    if (!priceId) {
      return errorResponse(`Price not configured for plan: ${plan}`, 503);
    }

    // Attach existing Stripe customer if we have one
    const [company] = await db
      .select({ stripeCustomerId: companies.stripeCustomerId })
      .from(companies)
      .where(eq(companies.id, ctx.companyId))
      .limit(1);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.APP_URL}/settings?tab=billing&billing=success`,
      cancel_url: `${env.APP_URL}/settings?tab=billing&billing=canceled`,
      ...(company?.stripeCustomerId
        ? { customer: company.stripeCustomerId }
        : {}),
      metadata: {
        companyId: ctx.companyId,
        userId: ctx.userId,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Billing error";
    return errorResponse(message, 500);
  }
}
