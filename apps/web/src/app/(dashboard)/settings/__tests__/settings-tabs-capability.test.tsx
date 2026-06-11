import { describe, it, expect } from "vitest";
import { visibleTabs } from "../settings-data";
import type { Capabilities } from "@/lib/capabilities";

describe("Task 12 — settings tabs gated by capability", () => {
  it("hides billing + invite-codes tabs under self_host", () => {
    const caps = { billing: false, inviteCodes: false } as unknown as Capabilities;
    const keys = visibleTabs(caps).map((t) => t.key);
    expect(keys).not.toContain("billing");
    expect(keys).not.toContain("invite-codes");
    expect(keys).toContain("general");
  });

  it("shows billing + invite-codes tabs when enabled", () => {
    const caps = { billing: true, inviteCodes: true } as unknown as Capabilities;
    const keys = visibleTabs(caps).map((t) => t.key);
    expect(keys).toContain("billing");
    expect(keys).toContain("invite-codes");
  });
});
