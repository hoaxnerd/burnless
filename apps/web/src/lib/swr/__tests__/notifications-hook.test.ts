import { describe, it, expect } from "vitest";
import { KEYS } from "../keys";

describe("notifications SWR wiring", () => {
  it("exposes the notifications key", () => {
    expect(KEYS.notifications).toBe("/api/notifications");
  });
  it("exports useNotifications", async () => {
    const mod = await import("../hooks");
    expect(typeof mod.useNotifications).toBe("function");
  });
});
