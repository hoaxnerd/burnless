/**
 * Payment provider resolution — single entry point for all billing operations.
 *
 * Routes to Stripe or Razorpay based on configuration and company currency.
 * All billing code should use this module, never import SDKs directly.
 */

import { env } from "@/lib/env";
import { getCapabilities } from "./capabilities";
import {
  StripePaymentProvider,
  RazorpayPaymentProvider,
  resolvePaymentProvider,
  type PaymentProvider,
  type PaymentProviderType,
} from "@burnless/engine/payments";
import type { CurrencyCode } from "@burnless/types";

// ── Singleton instances (lazy — only created when env vars are present) ──────

let _stripe: StripePaymentProvider | undefined;
let _razorpay: RazorpayPaymentProvider | undefined;

function getStripeProvider(): StripePaymentProvider | undefined {
  if (!env.hasStripe) return undefined;
  if (!_stripe) {
    _stripe = new StripePaymentProvider({
      secretKey: env.STRIPE_SECRET_KEY!,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET!,
    });
  }
  return _stripe;
}

function getRazorpayProvider(): RazorpayPaymentProvider | undefined {
  if (!env.hasRazorpay) return undefined;
  if (!_razorpay) {
    _razorpay = new RazorpayPaymentProvider({
      keyId: env.RAZORPAY_KEY_ID!,
      keySecret: env.RAZORPAY_KEY_SECRET!,
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET!,
    });
  }
  return _razorpay;
}

/**
 * Get the payment provider for a given currency.
 * Returns Razorpay for INR (if configured), Stripe for everything else.
 * Throws if no provider is available.
 */
export function getPaymentProvider(currency: CurrencyCode = "USD"): PaymentProvider {
  return resolvePaymentProvider(currency, {
    stripe: getStripeProvider(),
    razorpay: getRazorpayProvider(),
  });
}

/**
 * Get a specific payment provider by type.
 * Useful for webhooks where you know which provider sent the event.
 */
export function getProviderByType(type: PaymentProviderType): PaymentProvider {
  if (type === "stripe") {
    const provider = getStripeProvider();
    if (!provider) throw new Error("Stripe not configured");
    return provider;
  }
  if (type === "razorpay") {
    const provider = getRazorpayProvider();
    if (!provider) throw new Error("Razorpay not configured");
    return provider;
  }
  throw new Error(`Unknown payment provider: ${type}`);
}

/**
 * Resolve the plan ID (price/plan) for a given provider and plan name.
 */
export function resolvePlanId(
  providerType: PaymentProviderType,
  plan: "pro" | "team"
): string | undefined {
  if (providerType === "stripe") {
    return plan === "pro" ? env.STRIPE_PRO_PRICE_ID : env.STRIPE_TEAM_PRICE_ID;
  }
  if (providerType === "razorpay") {
    return plan === "pro" ? env.RAZORPAY_PRO_PLAN_ID : env.RAZORPAY_TEAM_PLAN_ID;
  }
  return undefined;
}

/**
 * Resolve plan name from a provider-specific plan/price ID.
 */
export function planFromPlanId(planId: string | undefined): "free" | "pro" | "team" {
  if (!planId) return "free";
  if (planId === env.STRIPE_PRO_PRICE_ID || planId === env.RAZORPAY_PRO_PLAN_ID) return "pro";
  if (planId === env.STRIPE_TEAM_PRICE_ID || planId === env.RAZORPAY_TEAM_PLAN_ID) return "team";
  return "free";
}

/**
 * Whether billing is enabled — gated by edition/capability, not mere config
 * presence. `capabilities.billing` auto-degrades to false when no payment
 * provider is configured (so `true` implies a provider exists) and is off
 * under self_host. (S1 Task 9 — capability spine.)
 */
export function isBillingEnabled(): boolean {
  return getCapabilities().billing;
}
