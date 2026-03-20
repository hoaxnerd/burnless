/**
 * Integration framework test suite — BUR-70
 *
 * Tests the integration provider registry, bank connector resolution,
 * and payment provider resolution logic.
 */

import { describe, it, expect } from "vitest";
import {
  ProviderRegistry,
  createDefaultRegistry,
  type IntegrationProvider,
} from "../integrations";
import { resolveBankConnector, PlaidBankConnector, AccountAggregatorConnector } from "../bank-connectors";
import { resolvePaymentProvider, StripePaymentProvider, RazorpayPaymentProvider } from "../payments";

// ── ProviderRegistry ─────────────────────────────────────────────────────────

describe("ProviderRegistry", () => {
  it("registers and retrieves a provider", () => {
    const registry = new ProviderRegistry();
    const provider: IntegrationProvider = {
      type: "test",
      name: "Test Provider",
      description: "A test",
      icon: "Wrench",
      status: "available",
    };
    registry.register(provider);
    expect(registry.get("test")).toBe(provider);
  });

  it("returns undefined for unknown type", () => {
    const registry = new ProviderRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("getAll returns all registered providers", () => {
    const registry = new ProviderRegistry();
    const p1: IntegrationProvider = { type: "a", name: "A", description: "", icon: "", status: "available" };
    const p2: IntegrationProvider = { type: "b", name: "B", description: "", icon: "", status: "coming_soon" };
    registry.register(p1);
    registry.register(p2);
    expect(registry.getAll()).toHaveLength(2);
  });

  it("getAvailable filters to available only", () => {
    const registry = new ProviderRegistry();
    registry.register({ type: "a", name: "A", description: "", icon: "", status: "available" });
    registry.register({ type: "b", name: "B", description: "", icon: "", status: "coming_soon" });
    registry.register({ type: "c", name: "C", description: "", icon: "", status: "available" });

    const available = registry.getAvailable();
    expect(available).toHaveLength(2);
    expect(available.every((p) => p.status === "available")).toBe(true);
  });

  it("getComingSoon filters to coming_soon only", () => {
    const registry = new ProviderRegistry();
    registry.register({ type: "a", name: "A", description: "", icon: "", status: "available" });
    registry.register({ type: "b", name: "B", description: "", icon: "", status: "coming_soon" });

    const coming = registry.getComingSoon();
    expect(coming).toHaveLength(1);
    expect(coming[0]!.type).toBe("b");
  });

  it("overwrites on duplicate type registration", () => {
    const registry = new ProviderRegistry();
    registry.register({ type: "dup", name: "First", description: "", icon: "", status: "available" });
    registry.register({ type: "dup", name: "Second", description: "", icon: "", status: "coming_soon" });

    expect(registry.get("dup")!.name).toBe("Second");
    expect(registry.getAll()).toHaveLength(1);
  });

  it("empty registry returns empty arrays", () => {
    const registry = new ProviderRegistry();
    expect(registry.getAll()).toHaveLength(0);
    expect(registry.getAvailable()).toHaveLength(0);
    expect(registry.getComingSoon()).toHaveLength(0);
  });
});

// ── createDefaultRegistry ────────────────────────────────────────────────────

describe("createDefaultRegistry", () => {
  it("registers exactly 8 providers", () => {
    const registry = createDefaultRegistry();
    expect(registry.getAll()).toHaveLength(8);
  });

  it("has exactly 1 available provider (csv_import)", () => {
    const registry = createDefaultRegistry();
    const available = registry.getAvailable();
    expect(available).toHaveLength(1);
    expect(available[0]!.type).toBe("csv_import");
    expect(available[0]!.name).toBe("CSV Import");
  });

  it("has exactly 7 coming_soon providers", () => {
    const registry = createDefaultRegistry();
    expect(registry.getComingSoon()).toHaveLength(7);
  });

  it("includes all expected provider types", () => {
    const registry = createDefaultRegistry();
    const expectedTypes = [
      "csv_import", "quickbooks", "xero", "freshbooks",
      "plaid", "mercury", "gusto", "stripe",
    ];
    for (const type of expectedTypes) {
      expect(registry.get(type)).toBeDefined();
    }
  });

  it("each provider has required fields", () => {
    const registry = createDefaultRegistry();
    for (const p of registry.getAll()) {
      expect(p.type).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.icon).toBeTruthy();
      expect(["available", "coming_soon"]).toContain(p.status);
    }
  });
});

// ── resolveBankConnector ─────────────────────────────────────────────────────

describe("resolveBankConnector", () => {
  // Create minimal connector instances (methods won't be called)
  const plaid = new PlaidBankConnector({ clientId: "test", secret: "test", environment: "sandbox" });
  const aa = new AccountAggregatorConnector({ apiBaseUrl: "http://test", clientId: "test", clientSecret: "test" });

  it("returns Plaid for us-east", () => {
    const connector = resolveBankConnector("us-east", { plaid, accountAggregator: aa });
    expect(connector).toBe(plaid);
  });

  it("returns Plaid for eu-west", () => {
    const connector = resolveBankConnector("eu-west", { plaid, accountAggregator: aa });
    expect(connector).toBe(plaid);
  });

  it("returns Account Aggregator for ap-south when available", () => {
    const connector = resolveBankConnector("ap-south", { plaid, accountAggregator: aa });
    expect(connector).toBe(aa);
  });

  it("falls back to Plaid for ap-south when AA not available", () => {
    const connector = resolveBankConnector("ap-south", { plaid });
    expect(connector).toBe(plaid);
  });

  it("returns null when no connectors configured for us-east", () => {
    const connector = resolveBankConnector("us-east", {});
    expect(connector).toBeNull();
  });

  it("returns null when no connectors configured for ap-south", () => {
    const connector = resolveBankConnector("ap-south", {});
    expect(connector).toBeNull();
  });

  it("Plaid connector has correct supported regions", () => {
    expect(plaid.supportedRegions).toContain("us-east");
    expect(plaid.supportedRegions).toContain("eu-west");
    expect(plaid.supportedCurrencies).toContain("USD");
    expect(plaid.supportedCurrencies).toContain("EUR");
  });

  it("Account Aggregator connector supports India", () => {
    expect(aa.supportedRegions).toContain("ap-south");
    expect(aa.supportedCurrencies).toContain("INR");
  });
});

// ── resolvePaymentProvider ───────────────────────────────────────────────────

describe("resolvePaymentProvider", () => {
  const stripe = new StripePaymentProvider({ secretKey: "sk_test", webhookSecret: "whsec_test" });
  const razorpay = new RazorpayPaymentProvider({ keyId: "rzp_test", keySecret: "test", webhookSecret: "test" });

  it("returns Razorpay for INR when available", () => {
    const provider = resolvePaymentProvider("INR", { stripe, razorpay });
    expect(provider).toBe(razorpay);
  });

  it("returns Stripe for USD", () => {
    const provider = resolvePaymentProvider("USD", { stripe, razorpay });
    expect(provider).toBe(stripe);
  });

  it("returns Stripe for EUR", () => {
    const provider = resolvePaymentProvider("EUR", { stripe, razorpay });
    expect(provider).toBe(stripe);
  });

  it("returns Stripe for GBP", () => {
    const provider = resolvePaymentProvider("GBP", { stripe });
    expect(provider).toBe(stripe);
  });

  it("returns Stripe for INR when Razorpay not available", () => {
    const provider = resolvePaymentProvider("INR", { stripe });
    expect(provider).toBe(stripe);
  });

  it("throws when no provider available", () => {
    expect(() => resolvePaymentProvider("USD", {})).toThrow(/No payment provider/);
  });

  it("throws for unsupported currency with no providers", () => {
    expect(() => resolvePaymentProvider("JPY", {})).toThrow();
  });

  it("Stripe supports 10 currencies", () => {
    expect(stripe.supportedCurrencies).toHaveLength(10);
    expect(stripe.supportedCurrencies).toContain("USD");
    expect(stripe.supportedCurrencies).toContain("INR");
    expect(stripe.supportedCurrencies).toContain("JPY");
  });

  it("Razorpay supports INR and USD", () => {
    expect(razorpay.supportedCurrencies).toEqual(["INR", "USD"]);
  });
});
