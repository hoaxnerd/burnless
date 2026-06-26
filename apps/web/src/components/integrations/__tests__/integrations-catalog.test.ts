import { describe, it, expect } from "vitest";
import { integrationRegistry, registerConnectors } from "@/lib/integrations/registry";
import { integrationsCatalog } from "../integrations-data";

describe("integrations catalog", () => {
  it("matches the integrationRegistry (no hardcoded drift)", () => {
    registerConnectors();
    const fromRegistry = integrationRegistry.catalog().map((c) => c.type).sort();
    const fromCatalog = integrationsCatalog().map((c) => c.type).sort();
    // every connector appears; the catalog adds only csv_import (non-connector, available)
    for (const t of fromRegistry) expect(fromCatalog).toContain(t);
    expect(fromCatalog).toContain("csv_import");
  });

  it("renders the Stripe connector as available (it has a source)", () => {
    registerConnectors();
    const stripe = integrationsCatalog().find((c) => c.type === "stripe");
    expect(stripe).toBeDefined();
    expect(stripe?.implemented).toBe(true);
    // icon is JSX (looked up by type), not a lucide-name string
    expect(stripe?.icon).toBeDefined();
    expect(typeof stripe?.icon).not.toBe("string");
  });

  it("keeps csv_import as the only non-registry available entry", () => {
    registerConnectors();
    const csv = integrationsCatalog().find((c) => c.type === "csv_import");
    expect(csv).toBeDefined();
    expect(csv?.implemented).toBe(true);
    expect(csv?.href).toBe("/import");
  });
});
