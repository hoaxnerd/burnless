import { NextResponse } from "next/server";
import { requireCompanyAccess, errorResponse } from "@/lib/api-helpers";

/**
 * Billing API — manages subscription state and Stripe integration.
 *
 * GET /api/billing — Returns current subscription status
 * POST /api/billing — Creates a Stripe Checkout session for upgrading
 *
 * Requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET env vars.
 * Until Stripe is configured, returns mock data for the free tier.
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

const FREE_LIMITS = {
  scenarios: 1,
  aiMessages: 10,
  exports: 3,
};

const PRO_LIMITS = {
  scenarios: Infinity,
  aiMessages: Infinity,
  exports: Infinity,
};

export async function GET() {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  // Until Stripe is configured, return free tier status
  const subscription: SubscriptionStatus = {
    plan: "free",
    status: "none",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    seats: 1,
    usage: {
      scenarios: { used: 0, limit: FREE_LIMITS.scenarios },
      aiMessages: { used: 0, limit: FREE_LIMITS.aiMessages },
      exports: { used: 0, limit: FREE_LIMITS.exports },
    },
  };

  return NextResponse.json(subscription);
}

export async function POST(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

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

    // Dynamic import of Stripe — only loaded when needed
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
