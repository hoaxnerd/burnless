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

describe("evaluateRules — feed", () => {
  it("emits post_published for an added item, ignores removed/other", () => {
    const changes = [
      { kind: "added", path: ["items", "g1"], after: { title: "Hello v2", link: "https://x/2", publishedAt: null } },
      { kind: "removed", path: ["items", "g0"], before: { title: "old" } },
    ];
    const alerts = evaluateRules("feed", changes as never);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ changeType: "post_published", summary: "New post: Hello v2", severity: "info" });
  });
});

describe("evaluateRules — sitemap", () => {
  it("emits page_added / page_removed, ignores count", () => {
    const changes = [
      { kind: "added", path: ["urls", "https://x/a"], after: 1 },
      { kind: "removed", path: ["urls", "https://x/b"], before: 1 },
      { kind: "modified", path: ["count"], before: 10, after: 11 },
    ];
    const alerts = evaluateRules("sitemap", changes as never);
    expect(alerts.map((a) => a.changeType).sort()).toEqual(["page_added", "page_removed"]);
    expect(alerts.find((a) => a.changeType === "page_added")!.summary).toBe("Page added: https://x/a");
  });

  it("caps a large same-type burst at 25 individual + 1 summary", () => {
    const changes = Array.from({ length: 40 }, (_, i) => ({ kind: "added", path: ["urls", `https://x/${i}`], after: 1 }));
    const alerts = evaluateRules("sitemap", changes as never);
    const added = alerts.filter((a) => a.changeType === "page_added");
    expect(added).toHaveLength(26); // 25 individual + 1 summary
    expect(added[25]!.summary).toBe("+15 pages added");
  });
});

describe("evaluateRules — non-regression", () => {
  it("pricing still falls back to genericAlert for unmatched changes", () => {
    const changes = [{ kind: "modified", path: ["plans", "0", "name"], before: "Pro", after: "Business" }];
    const alerts = evaluateRules("pricing", changes as never);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.changeType).toBe("field_changed"); // genericAlert, unchanged
  });
});
