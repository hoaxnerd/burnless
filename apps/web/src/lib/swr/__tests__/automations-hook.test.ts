import { describe, it, expect } from "vitest";
import { KEYS } from "../keys";

describe("automations SWR wiring", () => {
  it("exposes the list + detail keys", () => {
    expect(KEYS.automations).toBe("/api/automations");
    expect(KEYS.automation("j1")).toBe("/api/automations/j1");
  });
  it("exports useAutomations + useAutomation", async () => {
    const mod = await import("../hooks");
    expect(typeof mod.useAutomations).toBe("function");
    expect(typeof mod.useAutomation).toBe("function");
  });
});
