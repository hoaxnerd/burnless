import { NextResponse } from "next/server";
import { requireCompanyAccess, requireRole, getCompanyPlan, errorResponse } from "@/lib/api-helpers";
import { db, companies, scenarios, aiMessages, aiConversations } from "@burnless/db";
import { eq, and, gte, count } from "drizzle-orm";
import { getPlanLimits } from "@/lib/feature-gate";

/**
 * Billing API — manages subscription state and Stripe integration.
 *
 * GET /api/billing — Returns current subscription status with real usage
 * POST /api/billing — Creates a Stripe Checkout session for upgrading
 */

interface SubscriptionStatus {
  plan: "free" | "pro" | "team";
  status: "active" | "trialing" | "past_due" | "canceled" | "none";
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  seats: number;
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

  if (company?.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
    try {
      const { default: Stripe } = await import("stripe");
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return errorResponse(
      "Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing.",
      503
    );
  }

  try {
    const body = await request.json();
    const { plan } = body;

    if (!plan || !["pro", "team"].includes(plan)) {
      return errorResponse("Invalid plan. Choose 'pro' or 'team'.", 400);
    }

    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(stripeKey);

    const priceIds: Record<string, string> = {
      pro: process.env.STRIPE_PRO_PRICE_ID || "",
      team: process.env.STRIPE_TEAM_PRICE_ID || "",
    };

    const priceId = priceIds[plan];
    if (!priceId) {
      return errorResponse(`Price not configured for plan: ${plan}`, 503);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings?billing=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings?billing=canceled`,
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
