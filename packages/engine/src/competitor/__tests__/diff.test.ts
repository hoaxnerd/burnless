import { describe, it, expect } from "vitest";
import { diffStructured } from "../diff";

describe("diffStructured", () => {
  it("returns [] for deep-equal objects", () => {
    expect(diffStructured({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toEqual([]);
  });

  it("detects a modified primitive with full path", () => {
    const out = diffStructured({ plan: { price: 29 } }, { plan: { price: 39 } });
    expect(out).toEqual([{ kind: "modified", path: ["plan", "price"], before: 29, after: 39 }]);
  });

  it("detects added and removed keys", () => {
    const out = diffStructured({ a: 1 }, { a: 1, b: 2 });
    expect(out).toContainEqual({ kind: "added", path: ["b"], after: 2 });
    const out2 = diffStructured({ a: 1, b: 2 }, { a: 1 });
    expect(out2).toContainEqual({ kind: "removed", path: ["b"], before: 2 });
  });

  it("diffs arrays index-wise including length growth", () => {
    const out = diffStructured({ plans: [{ n: "Pro" }] }, { plans: [{ n: "Pro" }, { n: "Team" }] });
    expect(out).toContainEqual({ kind: "added", path: ["plans", "1"], after: { n: "Team" } });
  });

  it("produces deterministic ordering (sorted by path)", () => {
    const out = diffStructured({ b: 1, a: 1 }, { b: 2, a: 2 });
    expect(out.map((c) => c.path.join("."))).toEqual(["a", "b"]);
  });
});
