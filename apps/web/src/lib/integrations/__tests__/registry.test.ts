import { describe, it, expect } from "vitest";
import { IntegrationRegistry } from "../registry";
import type { IntegrationConnector } from "../contracts";

const sourced: IntegrationConnector = {
  id: "stripe", displayName: "Stripe", description: "x", icon: "CreditCard", capability: "integrations",
  credentialSpec: { fields: [{ key: "apiKey", label: "Key", secret: true }], validate: async () => ({ ok: true, livemode: false }) },
  source: { streams: [{ id: "balance_transactions" }], backfill: async function* () {}, incremental: async function* () {} },
};
const stub: IntegrationConnector = {
  id: "plaid", displayName: "Plaid", description: "y", icon: "Landmark", capability: "integrations",
  credentialSpec: { fields: [], validate: async () => ({ ok: true, livemode: false }) },
};

describe("IntegrationRegistry", () => {
  it("registers, gets, and rejects duplicate ids", () => {
    const r = new IntegrationRegistry();
    r.register(sourced);
    expect(r.get("stripe")).toBe(sourced);
    expect(() => r.register(sourced)).toThrow(/duplicate/i);
  });
  it("derives catalog status from presence of a source", () => {
    const r = new IntegrationRegistry();
    r.register(sourced); r.register(stub);
    const cat = r.catalog();
    expect(cat.find((c) => c.type === "stripe")?.status).toBe("available");
    expect(cat.find((c) => c.type === "plaid")?.status).toBe("coming_soon");
  });
});
