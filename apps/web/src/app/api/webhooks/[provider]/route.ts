import { NextResponse } from "next/server";
import { db, companies, users } from "@burnless/db";
import { eq } from "drizzle-orm";
import { email } from "@/lib/email";
import {
  subscriptionConfirmedEmail,
  paymentFailedEmail,
  subscriptionCanceledEmail,
} from "@/lib/email/templates";
import { getProviderByType, planFromPlanId } from "@/lib/payment";
import type { PaymentProviderType, NormalizedWebhookData } from "@burnless/engine";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Look up a company by its billing customer ID.
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

// ── Event Handlers (provider-agnostic, using normalized webhook data) ────────

async function handleCheckoutCompleted(data: NormalizedWebhookData, providerType: PaymentProviderType) {
  const companyId = data.metadata?.companyId;
  const subscriptionId = data.subscriptionId;
  const customerId = data.customerId;
  const userId = data.metadata?.userId;

  if (!companyId) return;

  // Resolve plan from subscription if available
  let plan: "free" | "pro" | "team" = "free";
  if (subscriptionId) {
    try {
      const provider = getProviderByType(providerType);
      const sub = await provider.getSubscription(subscriptionId);
      if (sub) plan = planFromPlanId(sub.planId);
    } catch {
      // Fall through with free plan
    }
  }

  await db
    .update(companies)
    .set({
      billingProvider: providerType,
      stripeCustomerId: customerId ?? null,
      stripeSubscriptionId: subscriptionId ?? null,
      stripePlan: plan,
    })
    .where(eq(companies.id, companyId));

  // Send confirmation email to company owner
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

async function handleSubscriptionUpdated(data: NormalizedWebhookData) {
  if (!data.customerId) return;
  const company = await findCompanyByCustomerId(data.customerId);
  if (!company) return;

  const plan = planFromPlanId(data.planId);
  const cancelAtPeriodEnd = data.cancelAtPeriodEnd === true;

  await db
    .update(companies)
    .set({
      stripeSubscriptionId: data.subscriptionId ?? null,
      stripePlan: plan,
    })
    .where(eq(companies.id, company.id));

  // Notify owner if they scheduled cancellation
  if (cancelAtPeriodEnd && data.currentPeriodEnd) {
    const addr = await ownerEmail(company.ownerId);
    if (addr) {
      const periodEnd = new Date(data.currentPeriodEnd * 1000);
      const msg = subscriptionCanceledEmail(periodEnd);
      await email.provider.send({ to: addr, ...msg }).catch((e) =>
        console.error("[webhook] Failed to send cancellation email:", e)
      );
    }
  }

  console.log(`[webhook] subscription.updated: company=${company.id} plan=${plan} cancel=${cancelAtPeriodEnd}`);
}

async function handleSubscriptionDeleted(data: NormalizedWebhookData) {
  if (!data.customerId) return;
  const company = await findCompanyByCustomerId(data.customerId);
  if (!company) return;

  await db
    .update(companies)
    .set({
      stripeSubscriptionId: null,
      stripePlan: "free",
    })
    .where(eq(companies.id, company.id));

  console.log(`[webhook] subscription.deleted: company=${company.id} downgraded to free`);
}

async function handlePaymentFailed(data: NormalizedWebhookData) {
  if (!data.customerId) return;
  const company = await findCompanyByCustomerId(data.customerId);
  if (!company) return;

  const addr = await ownerEmail(company.ownerId);
  if (addr) {
    const msg = paymentFailedEmail();
    await email.provider.send({ to: addr, ...msg }).catch((e) =>
      console.error("[webhook] Failed to send payment-failed email:", e)
    );
  }

  console.error(`[webhook] payment_failed: company=${company.id} customer=${data.customerId}`);
}

// ── Route Handler ────────────────────────────────────────────────────────────

/**
 * Webhook handler for billing and integration providers.
 * POST /api/webhooks/{provider}
 *
 * Stripe and Razorpay webhooks are verified via the PaymentProvider abstraction.
 * Both providers return normalized data — handlers are fully provider-agnostic.
 * Other providers return 200 acknowledgement (not yet implemented).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerName } = await params;
  const body = await request.text();

  // ── Billing Providers (Stripe / Razorpay) ────────────────────────────────
  if (providerName === "stripe" || providerName === "razorpay") {
    const signature =
      providerName === "stripe"
        ? request.headers.get("stripe-signature")
        : request.headers.get("x-razorpay-signature");

    if (!signature) {
      return NextResponse.json(
        { error: `Missing ${providerName} signature header` },
        { status: 400 }
      );
    }

    try {
      const paymentProvider = getProviderByType(providerName as PaymentProviderType);
      const event = await paymentProvider.handleWebhook(body, signature);

      // Map provider-specific event types to our handlers
      const eventMap: Record<string, () => Promise<void>> = {
        // Stripe events
        "checkout.session.completed": () => handleCheckoutCompleted(event.data, providerName as PaymentProviderType),
        "customer.subscription.updated": () => handleSubscriptionUpdated(event.data),
        "customer.subscription.deleted": () => handleSubscriptionDeleted(event.data),
        "invoice.payment_failed": () => handlePaymentFailed(event.data),
        // Razorpay events (mapped to same handlers)
        "subscription.activated": () => handleCheckoutCompleted(event.data, providerName as PaymentProviderType),
        "subscription.charged": () => handleSubscriptionUpdated(event.data),
        "subscription.cancelled": () => handleSubscriptionDeleted(event.data),
        "payment.failed": () => handlePaymentFailed(event.data),
      };

      const handler = eventMap[event.type];
      if (handler) {
        await handler();
      } else {
        console.log(`[webhook] Unhandled ${providerName} event: ${event.type}`);
      }

      return NextResponse.json({ received: true, type: event.type });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Webhook verification failed";
      console.error(`[webhook] ${providerName} verification error: ${message}`);
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  // ── Other Integration Providers ──────────────────────────────────────────
  switch (providerName) {
    case "quickbooks":
    case "xero":
    case "freshbooks":
    case "plaid":
    case "mercury":
    case "gusto": {
      return NextResponse.json({
        received: true,
        provider: providerName,
        status: "not_implemented",
      });
    }

    default:
      return NextResponse.json(
        { error: `Unknown provider: ${providerName}` },
        { status: 404 }
      );
  }
}
