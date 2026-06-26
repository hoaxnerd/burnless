import type StripeNS from "stripe";

/** Pinned so a Stripe-side upgrade can't silently reshape responses our mapping depends on. */
export const STRIPE_API_VERSION = "2026-06-24.dahlia";

/** Lazy-import the SDK (mirrors StripePaymentProvider) so `stripe` never enters a hot
 *  route's module graph until a connector actually runs. */
export async function getStripe(apiKey: string): Promise<StripeNS> {
  const { default: Stripe } = await import("stripe");
  // maxNetworkRetries handles 429s with exponential backoff inside the SDK, so the
  // connector does not need its own retry wrapper.
  return new Stripe(apiKey, { apiVersion: STRIPE_API_VERSION as StripeNS.LatestApiVersion, maxNetworkRetries: 3, timeout: 80_000 });
}
