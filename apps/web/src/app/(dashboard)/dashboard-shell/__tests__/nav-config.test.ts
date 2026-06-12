import { describe, it, expect } from "vitest";
import { coreNavItems, NAV_ITEM_MAP } from "../nav-config";

describe("automations nav item", () => {
  it("is registered with the right href + sits after connections", () => {
    const item = coreNavItems.find((i) => i.id === "automations");
    expect(item).toBeTruthy();
    expect(item!.href).toBe("/automations");
    const connIdx = coreNavItems.findIndex((i) => i.id === "connections");
    const autoIdx = coreNavItems.findIndex((i) => i.id === "automations");
    expect(autoIdx).toBe(connIdx + 1);
    expect(NAV_ITEM_MAP.get("automations")?.label).toBe("Automations");
  });
});
