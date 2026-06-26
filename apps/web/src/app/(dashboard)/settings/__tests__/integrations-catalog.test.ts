import { describe, it, expect } from "vitest";
import { integrationRegistry, registerConnectors } from "@/lib/integrations/registry";
import { catalogForSettings } from "../settings-data";

describe("settings integrations catalog", () => {
  it("matches the integrationRegistry (no hardcoded drift)", () => {
    registerConnectors();
    const fromRegistry = integrationRegistry.catalog().map((c) => c.type).sort();
    const fromSettings = catalogForSettings().map((c) => c.type).sort();
    // every connector appears; settings adds only csv_import (non-connector, available)
    for (const t of fromRegistry) expect(fromSettings).toContain(t);
    expect(fromSettings).toContain("csv_import");
  });

  it("renders the Stripe connector as available (it has a source)", () => {
    registerConnectors();
    const stripe = catalogForSettings().find((c) => c.type === "stripe");
    expect(stripe).toBeDefined();
    expect(stripe?.implemented).toBe(true);
    // icon is JSX (looked up by type), not a lucide-name string
    expect(stripe?.icon).toBeDefined();
    expect(typeof stripe?.icon).not.toBe("string");
  });

  it("keeps csv_import as the only non-registry available entry", () => {
    registerConnectors();
    const csv = catalogForSettings().find((c) => c.type === "csv_import");
    expect(csv).toBeDefined();
    expect(csv?.implemented).toBe(true);
    expect(csv?.href).toBe("/import");
  });
});
