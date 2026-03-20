import { NextResponse } from "next/server";

/**
 * Webhook handler skeleton for integration providers.
 * Each provider (quickbooks, xero, plaid, stripe, etc.) sends webhook
 * events to POST /api/webhooks/{provider}.
 *
 * When we add real integrations, each provider will:
 * 1. Verify the webhook signature
 * 2. Parse the event payload
 * 3. Route to the appropriate handler (sync, disconnect, error)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  // Verify webhook signature per provider
  // Each integration will implement its own verification
  const body = await request.text();

  switch (provider) {
    case "stripe": {
      // TODO: Verify Stripe webhook signature using stripe.webhooks.constructEvent()
      // const sig = request.headers.get("stripe-signature");
      // const event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
      return NextResponse.json({ received: true, provider: "stripe" });
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
