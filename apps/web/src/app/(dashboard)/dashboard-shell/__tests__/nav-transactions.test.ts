import { describe, it, expect } from "vitest";
import { coreNavItems, NAV_ITEM_MAP } from "../nav-config";

describe("coreNavItems — Transactions entry", () => {
  it("includes a single Transactions item pointing at /transactions", () => {
    const tx = coreNavItems.filter((i) => i.id === "transactions");
    expect(tx).toHaveLength(1);
    expect(tx[0]!.href).toBe("/transactions");
    expect(tx[0]!.label).toBe("Transactions");
    expect(NAV_ITEM_MAP.get("transactions")?.href).toBe("/transactions");
  });
});
