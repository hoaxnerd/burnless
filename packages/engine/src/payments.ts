/// <reference path="./vendor.d.ts" />
/**
 * Payment provider abstraction layer.
 *
 * Abstracts billing operations across providers (Stripe for global, Razorpay for India).
 * All monetary amounts use the smallest currency unit (cents, paise) to avoid float issues.
 */

import type { CurrencyCode } from "@burnless/types";

// ── Types ───────────────────────────────────────────────────────────────────

export type PaymentProviderType = "stripe" | "razorpay";

export interface PaymentCustomer {
  id: string;
  email: string;
  name: string | null;
  currency: CurrencyCode;
  metadata?: Record<string, string>;
}

export interface PaymentPlan {
  id: string;
  name: string;
  /** Amount in smallest currency unit (cents/paise). */
  amount: number;
  currency: CurrencyCode;
  interval: "month" | "year";
}

export interface PaymentSubscription {
  id: string;
  customerId: string;
  planId: string;
  status: "active" | "past_due" | "canceled" | "trialing" | "paused";
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface CreateCheckoutOptions {
  customerId: string;
  planId: string;
  successUrl: string;
  cancelUrl: string;
  currency?: CurrencyCode;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

// ── Provider Interface ──────────────────────────────────────────────────────

export interface PaymentProvider {
  readonly type: PaymentProviderType;
  readonly name: string;
  /** Currencies this provider supports natively. */
  readonly supportedCurrencies: CurrencyCode[];

  createCustomer(email: string, name: string | null, currency: CurrencyCode): Promise<PaymentCustomer>;
  getCustomer(id: string): Promise<PaymentCustomer | null>;

  createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession>;
  getSubscription(id: string): Promise<PaymentSubscription | null>;
  cancelSubscription(id: string, atPeriodEnd?: boolean): Promise<void>;

  /** Undo a scheduled cancellation (reactivate). */
  reactivateSubscription(id: string): Promise<void>;

  /** Open a self-service billing portal. Returns null if provider has no portal concept. */
  createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string } | null>;

  /** Handle a webhook event from the provider. Returns the event type and payload. */
  handleWebhook(payload: string | Buffer, signature: string): Promise<{
    type: string;
    data: Record<string, unknown>;
  }>;
}

// ── Stripe Provider ─────────────────────────────────────────────────────────

export class StripePaymentProvider implements PaymentProvider {
  readonly type = "stripe" as const;
  readonly name = "Stripe";
  readonly supportedCurrencies: CurrencyCode[] = [
    "USD", "EUR", "GBP", "INR", "CAD", "AUD", "SGD", "AED", "JPY", "BRL",
  ];

  constructor(private readonly config: { secretKey: string; webhookSecret: string }) {}

  async createCustomer(email: string, name: string | null, currency: CurrencyCode): Promise<PaymentCustomer> {
    // Stripe SDK integration point — lazy import to avoid bundling in client
    const stripe = await this.getStripe();
    const customer = await stripe.customers.create({
      email,
      name: name ?? undefined,
      metadata: { currency },
    });
    return { id: customer.id, email, name, currency };
  }

  async getCustomer(id: string): Promise<PaymentCustomer | null> {
    const stripe = await this.getStripe();
    try {
      const customer = await stripe.customers.retrieve(id);
      if ("deleted" in customer && customer.deleted) return null;
      return {
        id: customer.id,
        email: (customer as { email: string }).email,
        name: (customer as { name: string | null }).name,
        currency: ((customer as { metadata?: Record<string, string> }).metadata?.currency as CurrencyCode) || "USD",
      };
    } catch {
      return null;
    }
  }

  async createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession> {
    const stripe = await this.getStripe();
    const session = await stripe.checkout.sessions.create({
      customer: options.customerId,
      mode: "subscription",
      line_items: [{ price: options.planId, quantity: 1 }],
      success_url: options.successUrl,
      cancel_url: options.cancelUrl,
      currency: options.currency?.toLowerCase(),
    });
    return { id: session.id, url: session.url! };
  }

  async getSubscription(id: string): Promise<PaymentSubscription | null> {
    const stripe = await this.getStripe();
    try {
      const sub = await stripe.subscriptions.retrieve(id);
      return {
        id: sub.id,
        customerId: sub.customer as string,
        planId: (sub.items.data[0]?.price.id) ?? "",
        status: sub.status as PaymentSubscription["status"],
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      };
    } catch {
      return null;
    }
  }

  async cancelSubscription(id: string, atPeriodEnd = true): Promise<void> {
    const stripe = await this.getStripe();
    if (atPeriodEnd) {
      await stripe.subscriptions.update(id, { cancel_at_period_end: true });
    } else {
      await stripe.subscriptions.cancel(id);
    }
  }

  async reactivateSubscription(id: string): Promise<void> {
    const stripe = await this.getStripe();
    await stripe.subscriptions.update(id, { cancel_at_period_end: false });
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
    const stripe = await this.getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  }

  async handleWebhook(payload: string | Buffer, signature: string) {
    const stripe = await this.getStripe();
    const event = stripe.webhooks.constructEvent(payload, signature, this.config.webhookSecret);
    return { type: event.type, data: event.data.object as unknown as Record<string, unknown> };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getStripe(): Promise<any> {
    const { default: Stripe } = await import("stripe");
    return new Stripe(this.config.secretKey);
  }
}

// ── Razorpay Provider ───────────────────────────────────────────────────────

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly type = "razorpay" as const;
  readonly name = "Razorpay";
  readonly supportedCurrencies: CurrencyCode[] = ["INR", "USD"];

  constructor(private readonly config: { keyId: string; keySecret: string; webhookSecret: string }) {}

  async createCustomer(email: string, name: string | null, currency: CurrencyCode): Promise<PaymentCustomer> {
    const rz = await this.getRazorpay();
    const customer = await rz.customers.create({
      email,
      name: name ?? "Customer",
      notes: { currency },
    });
    return { id: customer.id, email, name, currency };
  }

  async getCustomer(id: string): Promise<PaymentCustomer | null> {
    const rz = await this.getRazorpay();
    try {
      const customer = await rz.customers.fetch(id);
      return {
        id: customer.id,
        email: customer.email,
        name: customer.name || null,
        currency: (customer.notes?.currency as CurrencyCode) || "INR",
      };
    } catch {
      return null;
    }
  }

  async createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession> {
    const rz = await this.getRazorpay();
    const subscription = await rz.subscriptions.create({
      plan_id: options.planId,
      customer_id: options.customerId,
      total_count: 12,
      notes: { successUrl: options.successUrl, cancelUrl: options.cancelUrl },
    });
    return {
      id: subscription.id,
      url: subscription.short_url,
    };
  }

  async getSubscription(id: string): Promise<PaymentSubscription | null> {
    const rz = await this.getRazorpay();
    try {
      const sub = await rz.subscriptions.fetch(id);
      const statusMap: Record<string, PaymentSubscription["status"]> = {
        active: "active",
        pending: "trialing",
        halted: "past_due",
        cancelled: "canceled",
        paused: "paused",
      };
      return {
        id: sub.id,
        customerId: sub.customer_id || "",
        planId: sub.plan_id,
        status: statusMap[sub.status] || "active",
        currentPeriodEnd: new Date(sub.current_end * 1000),
        cancelAtPeriodEnd: sub.status === "cancelled",
      };
    } catch {
      return null;
    }
  }

  async cancelSubscription(id: string): Promise<void> {
    const rz = await this.getRazorpay();
    await rz.subscriptions.cancel(id);
  }

  async reactivateSubscription(id: string): Promise<void> {
    // Razorpay does not support reactivation — cancelled subscriptions must be recreated
    const rz = await this.getRazorpay();
    await rz.subscriptions.resume(id);
  }

  async createPortalSession(): Promise<null> {
    // Razorpay has no self-service portal equivalent
    return null;
  }

  async handleWebhook(payload: string | Buffer, signature: string) {
    const { validateWebhookSignature } = await import("razorpay/dist/utils/razorpay-utils.js");
    const valid = validateWebhookSignature(
      typeof payload === "string" ? payload : payload.toString(),
      signature,
      this.config.webhookSecret
    );
    if (!valid) throw new Error("Invalid Razorpay webhook signature");
    const body = JSON.parse(typeof payload === "string" ? payload : payload.toString());
    return { type: body.event, data: body.payload };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getRazorpay(): Promise<any> {
    const { default: Razorpay } = await import("razorpay");
    return new Razorpay({ key_id: this.config.keyId, key_secret: this.config.keySecret });
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Resolve the best payment provider for a given currency.
 * Returns Razorpay for INR (UPI/netbanking support), Stripe for everything else.
 */
export function resolvePaymentProvider(
  currency: CurrencyCode,
  providers: { stripe?: StripePaymentProvider; razorpay?: RazorpayPaymentProvider }
): PaymentProvider {
  if (currency === "INR" && providers.razorpay) {
    return providers.razorpay;
  }
  if (providers.stripe) {
    return providers.stripe;
  }
  throw new Error(`No payment provider available for currency ${currency}`);
}
