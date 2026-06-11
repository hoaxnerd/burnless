import { describe, it, expect, afterEach, vi } from "vitest";

// payment.ts imports @burnless/engine/payments, which dynamically imports the
// optional `razorpay` SDK (not installed in test). isBillingEnabled itself does
// NOT touch the engine — it only reads getCapabilities() — so we stub the engine
// payments module to keep the import graph resolvable while exercising the real
// isBillingEnabled + getCapabilities wiring.
vi.mock("@burnless/engine/payments", () => ({
  StripePaymentProvider: class {},
  RazorpayPaymentProvider: class {},
  resolvePaymentProvider: vi.fn(),
}));

describe("isBillingEnabled via capabilities", () => {
  const ORIG = process.env;
  afterEach(() => { process.env = ORIG; });
  it("false under self_host even if Stripe configured", async () => {
    process.env = { ...ORIG, STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: "whsec" };
    delete process.env.BURNLESS_DEPLOYMENT; // self_host
    const { isBillingEnabled } = await import("../payment");
    expect(isBillingEnabled()).toBe(false);
  });
  it("true under cloud when Stripe configured", async () => {
    process.env = { ...ORIG, BURNLESS_DEPLOYMENT: "cloud", STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: "whsec" };
    const { isBillingEnabled } = await import("../payment");
    expect(isBillingEnabled()).toBe(true);
  });
});
