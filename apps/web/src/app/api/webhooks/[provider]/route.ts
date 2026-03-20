import { NextResponse } from "next/server";
import { db, companies, users } from "@burnless/db";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { email } from "@/lib/email";
import {
  subscriptionConfirmedEmail,
  paymentFailedEmail,
  subscriptionCanceledEmail,
} from "@/lib/email/templates";

/**
 * Derive plan name from Stripe price ID.
 * Falls back to "free" if the price doesn't match a known plan.
 */
function planFromPriceId(priceId: string | undefined): "free" | "pro" | "team" {
  if (!priceId) return "free";
  if (priceId === env.STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId === env.STRIPE_TEAM_PRICE_ID) return "team";
  return "free";
}

/**
 * Look up a company by its Stripe customer ID so we can update plan state.
 */
async function findCompanyByCustomerId(customerId: string) {
  const [company] = await db
    .select({ id: companies.id, ownerId: companies.ownerId })
    .from(companies)
    .where(eq(companies.stripeCustomerId, customerId))
    .limit(1);
  return company ?? null;
}

/**
 * Find the email for the company owner (for billing notifications).
 */
async function ownerEmail(ownerId: string): Promise<string | null> {
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, ownerId))
    .limit(1);
  return user?.email ?? null;
}

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

        switch (event.type) {
          // ----------------------------------------------------------
          // Checkout completed → persist customer + subscription + plan
          // ----------------------------------------------------------
          case "checkout.session.completed": {
            const session = event.data.object as Record<string, any>;
            const companyId = session.metadata?.companyId;
            const subscriptionId = session.subscription as string | undefined;

            if (companyId) {
              // Resolve plan from subscription line items
              let plan: "free" | "pro" | "team" = "free";
              if (subscriptionId) {
                const sub = await stripe.subscriptions.retrieve(subscriptionId);
                const priceId = sub.items?.data?.[0]?.price?.id;
                plan = planFromPriceId(priceId);
              }

              await db
                .update(companies)
                .set({
                  stripeCustomerId: session.customer as string,
                  stripeSubscriptionId: subscriptionId ?? null,
                  stripePlan: plan,
                })
                .where(eq(companies.id, companyId));

              // Send confirmation email to company owner
              const userId = session.metadata?.userId;
              if (userId) {
                const addr = await ownerEmail(userId);
                if (addr) {
                  const msg = subscriptionConfirmedEmail(plan);
                  await email.provider.send({ to: addr, ...msg }).catch((e) =>
                    console.error("[webhook] Failed to send confirmation email:", e)
                  );
                }
              }
            }
            break;
          }

          // ----------------------------------------------------------
          // Subscription updated → sync plan + detect cancellation
          // ----------------------------------------------------------
          case "customer.subscription.updated": {
            const sub = event.data.object as Record<string, any>;
            const customerId = sub.customer as string;
            const company = await findCompanyByCustomerId(customerId);
            if (!company) break;

            const priceId = sub.items?.data?.[0]?.price?.id;
            const plan = planFromPriceId(priceId);
            const cancelAtPeriodEnd = sub.cancel_at_period_end === true;

            await db
              .update(companies)
              .set({
                stripeSubscriptionId: sub.id,
                stripePlan: cancelAtPeriodEnd ? plan : plan, // keep current plan until period ends
              })
              .where(eq(companies.id, company.id));

            // Notify owner if they scheduled cancellation
            if (cancelAtPeriodEnd) {
              const addr = await ownerEmail(company.ownerId);
              if (addr) {
                const periodEnd = new Date(sub.current_period_end * 1000);
                const msg = subscriptionCanceledEmail(periodEnd);
                await email.provider.send({ to: addr, ...msg }).catch((e) =>
                  console.error("[webhook] Failed to send cancellation email:", e)
                );
              }
            }

            console.log(`[webhook] subscription.updated: company=${company.id} plan=${plan} cancel=${cancelAtPeriodEnd}`);
            break;
          }

          // ----------------------------------------------------------
          // Subscription deleted → downgrade to free
          // ----------------------------------------------------------
          case "customer.subscription.deleted": {
            const sub = event.data.object as Record<string, any>;
            const customerId = sub.customer as string;
            const company = await findCompanyByCustomerId(customerId);
            if (!company) break;

            await db
              .update(companies)
              .set({
                stripeSubscriptionId: null,
                stripePlan: "free",
              })
              .where(eq(companies.id, company.id));

            console.log(`[webhook] subscription.deleted: company=${company.id} downgraded to free`);
            break;
          }

          // ----------------------------------------------------------
          // Payment failed → notify owner
          // ----------------------------------------------------------
          case "invoice.payment_failed": {
            const invoice = event.data.object as Record<string, any>;
            const customerId = invoice.customer as string;
            const company = await findCompanyByCustomerId(customerId);
            if (!company) break;

            const addr = await ownerEmail(company.ownerId);
            if (addr) {
              const msg = paymentFailedEmail();
              await email.provider.send({ to: addr, ...msg }).catch((e) =>
                console.error("[webhook] Failed to send payment-failed email:", e)
              );
            }

            console.error(`[webhook] payment_failed: company=${company.id} customer=${customerId}`);
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
