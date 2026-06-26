import { describe, it, expect, vi } from "vitest";

// Mock the lazy SDK factory so no network happens.
vi.mock("../client", () => ({
  STRIPE_API_VERSION: "2026-06-24.dahlia",
  getStripe: vi.fn(),
}));
import { getStripe } from "../client";
import { stripeConnector } from "../connector";

describe("stripeConnector.credentialSpec.validate", () => {
  it("rejects a non-stripe-looking key without calling the API", async () => {
    const res = await stripeConnector.credentialSpec.validate({ apiKey: "not-a-key" });
    expect(res.ok).toBe(false);
    expect(getStripe).not.toHaveBeenCalled();
  });
  it("returns ok+livemode from GET /v1/balance", async () => {
    (getStripe as any).mockReturnValue({ balance: { retrieve: async () => ({ livemode: false, available: [{ currency: "usd" }] }) } });
    const res = await stripeConnector.credentialSpec.validate({ apiKey: "rk_test_abc" });
    expect(res).toMatchObject({ ok: true, livemode: false });
  });
  it("returns ok:false with a friendly message on auth error", async () => {
    (getStripe as any).mockReturnValue({ balance: { retrieve: async () => { throw new Error("Invalid API Key provided"); } } });
    const res = await stripeConnector.credentialSpec.validate({ apiKey: "rk_test_bad" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/key/i);
  });
});
