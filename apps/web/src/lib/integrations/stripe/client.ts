import type StripeNS from "stripe";

/** Pinned so a Stripe-side upgrade can't silently reshape responses our mapping depends on. */
export const STRIPE_API_VERSION = "2026-06-24.dahlia";

/** Lazy-import the SDK (mirrors StripePaymentProvider) so `stripe` never enters a hot
 *  route's module graph until a connector actually runs. */
export async function getStripe(apiKey: string): Promise<StripeNS> {
  const { default: Stripe } = await import("stripe");
  return new Stripe(apiKey, { apiVersion: STRIPE_API_VERSION as StripeNS.LatestApiVersion, maxNetworkRetries: 3, timeout: 80_000 });
}

/** Full-jitter exponential backoff on 429. */
export async function withStripeBackoff<T>(fn: () => Promise<T>, max = 6): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (err: unknown) {
      const e = err as { statusCode?: number; type?: string };
      const is429 = e?.statusCode === 429 || e?.type === "StripeRateLimitError";
      if (!is429 || attempt >= max) throw err;
      const base = Math.min(1000 * 2 ** attempt, 16_000);
      await new Promise((r) => setTimeout(r, Math.random() * base));
    }
  }
}
