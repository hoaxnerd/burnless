// packages/engine/src/competitor/__tests__/rules.test.ts
import { describe, it, expect } from "vitest";
import { evaluateRules } from "../rules";
import type { Change } from "../types";

describe("evaluateRules — pricing", () => {
  it("flags a >=10% price increase as warning with % in summary", () => {
    const changes: Change[] = [
      { kind: "modified", path: ["plans", "0", "price", "amount"], before: 29, after: 39 },
    ];
    const [alert] = evaluateRules("pricing", changes);
    expect(alert.changeType).toBe("price_increase");
    expect(alert.severity).toBe("warning");
    expect(alert.summary).toContain("29");
    expect(alert.summary).toContain("39");
    expect(alert.summary).toContain("34"); // ~+34%
  });

  it("flags a small price decrease as info", () => {
    const changes: Change[] = [
      { kind: "modified", path: ["plans", "0", "price", "amount"], before: 100, after: 95 },
    ];
    const [alert] = evaluateRules("pricing", changes);
    expect(alert.changeType).toBe("price_decrease");
    expect(alert.severity).toBe("info");
  });

  it("flags an added plan", () => {
    const changes: Change[] = [{ kind: "added", path: ["plans", "2"], after: { name: "Team" } }];
    const [alert] = evaluateRules("pricing", changes);
    expect(alert.changeType).toBe("plan_added");
  });
});

describe("evaluateRules — social", () => {
  it("flags follower growth", () => {
    const changes: Change[] = [{ kind: "modified", path: ["followers"], before: 1000, after: 2200 }];
    const [alert] = evaluateRules("social", changes);
    expect(alert.changeType).toBe("followers_up");
    expect(alert.summary).toContain("1,200");
  });
});

describe("evaluateRules — fallback", () => {
  it("emits a generic field_changed alert for unknown paths (never drops)", () => {
    const changes: Change[] = [{ kind: "modified", path: ["mystery"], before: "a", after: "b" }];
    const out = evaluateRules("pricing", changes);
    expect(out).toHaveLength(1);
    expect(out[0].changeType).toBe("field_changed");
  });
});
