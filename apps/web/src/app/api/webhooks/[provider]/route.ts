import { NextResponse } from "next/server";
import { db, companies } from "@burnless/db";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";

/**
 * Webhook handler for integration providers.
 * POST /api/webhooks/{provider}
 *
 * Stripe webhooks are verified using the Stripe SDK.
 * Other providers return 200 acknowledgement (not yet implemented).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const body = await request.text();

  switch (provider) {
    case "stripe": {
      const sig = request.headers.get("stripe-signature");
      const endpointSecret = env.STRIPE_WEBHOOK_SECRET;

      if (!endpointSecret) {
        return NextResponse.json(
          { error: "Stripe webhook secret not configured" },
          { status: 503 }
        );
      }

      if (!sig) {
        return NextResponse.json(
          { error: "Missing stripe-signature header" },
          { status: 400 }
        );
      }

      try {
        const { default: Stripe } = await import("stripe");
        const stripe = new Stripe(env.STRIPE_SECRET_KEY!);
        const event = stripe.webhooks.constructEvent(body, sig, endpointSecret);

        // Route events to handlers
        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object;
            const companyId = session.metadata?.companyId;
            if (companyId) {
              await db
                .update(companies)
                .set({ stripeCustomerId: session.customer as string })
                .where(eq(companies.id, companyId));
            }
            break;
          }
          case "customer.subscription.updated":
          case "customer.subscription.deleted": {
            // Subscription state changes are read from Stripe directly
            // in the billing GET endpoint. Log for now.
            console.log(`[webhook] ${event.type}:`, event.data.object.id);
            break;
          }
          case "invoice.payment_failed": {
            console.log(
              `[webhook] Payment failed for customer:`,
              event.data.object.customer
            );
            break;
          }
          default:
            console.log(`[webhook] Unhandled event type: ${event.type}`);
        }

        return NextResponse.json({ received: true, type: event.type });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Webhook verification failed";
        console.error(`[webhook] Stripe verification error: ${message}`);
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    case "quickbooks":
    case "xero":
    case "freshbooks":
    case "plaid":
    case "mercury":
    case "gusto": {
      // Coming soon — return 200 to acknowledge receipt
      return NextResponse.json({
        received: true,
        provider,
        status: "not_implemented",
      });
    }

    default:
      return NextResponse.json(
        { error: `Unknown provider: ${provider}` },
        { status: 404 }
      );
  }
}
