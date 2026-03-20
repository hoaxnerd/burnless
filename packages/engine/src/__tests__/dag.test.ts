import { describe, it, expect } from "vitest";
import { DependencyGraph, CircularDependencyError } from "../dag";

describe("DependencyGraph", () => {
  describe("topologicalSort", () => {
    it("returns empty array for empty graph", () => {
      const g = new DependencyGraph();
      expect(g.topologicalSort()).toEqual([]);
    });

    it("returns single node", () => {
      const g = new DependencyGraph();
      g.addNode("a");
      expect(g.topologicalSort()).toEqual(["a"]);
    });

    it("sorts independent nodes alphabetically (deterministic)", () => {
      const g = new DependencyGraph();
      g.addNode("c");
      g.addNode("a");
      g.addNode("b");
      expect(g.topologicalSort()).toEqual(["a", "b", "c"]);
    });

    it("puts dependencies before dependents", () => {
      const g = new DependencyGraph();
      g.addDependency("b", "a"); // b depends on a
      const sorted = g.topologicalSort();
      expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("b"));
    });

    it("resolves a linear chain A → B → C", () => {
      const g = new DependencyGraph();
      g.addDependency("c", "b"); // c depends on b
      g.addDependency("b", "a"); // b depends on a
      expect(g.topologicalSort()).toEqual(["a", "b", "c"]);
    });

    it("resolves a diamond dependency", () => {
      // D depends on B and C; B and C both depend on A
      const g = new DependencyGraph();
      g.addDependency("d", "b");
      g.addDependency("d", "c");
      g.addDependency("b", "a");
      g.addDependency("c", "a");
      const sorted = g.topologicalSort();
      expect(sorted[0]).toBe("a");
      expect(sorted[sorted.length - 1]).toBe("d");
      expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("b"));
      expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("c"));
    });

    it("handles complex multi-level dependencies", () => {
      const g = new DependencyGraph();
      // Simulates metric dependency: LTV:CAC → LTV → ARPA, churnRate
      //                              LTV:CAC → CAC → acquisitionSpend, newCustomers
      g.addDependency("ltvCacRatio", "ltv");
      g.addDependency("ltvCacRatio", "cac");
      g.addDependency("ltv", "arpa");
      g.addDependency("ltv", "churnRate");
      g.addDependency("cac", "acquisitionSpend");
      g.addDependency("cac", "newCustomers");
      g.addNode("mrr"); // independent

      const sorted = g.topologicalSort();
      expect(sorted.indexOf("arpa")).toBeLessThan(sorted.indexOf("ltv"));
      expect(sorted.indexOf("churnRate")).toBeLessThan(sorted.indexOf("ltv"));
      expect(sorted.indexOf("ltv")).toBeLessThan(sorted.indexOf("ltvCacRatio"));
      expect(sorted.indexOf("cac")).toBeLessThan(sorted.indexOf("ltvCacRatio"));
    });
  });

  describe("cycle detection", () => {
    it("detects a simple A ↔ B cycle", () => {
      const g = new DependencyGraph();
      g.addDependency("a", "b");
      g.addDependency("b", "a");
      expect(() => g.topologicalSort()).toThrow(CircularDependencyError);
    });

    it("detects a three-node cycle A → B → C → A", () => {
      const g = new DependencyGraph();
      g.addDependency("a", "b");
      g.addDependency("b", "c");
      g.addDependency("c", "a");
      expect(() => g.topologicalSort()).toThrow(CircularDependencyError);
    });

    it("includes cycle path in error", () => {
      const g = new DependencyGraph();
      g.addDependency("x", "y");
      g.addDependency("y", "z");
      g.addDependency("z", "x");
      try {
        g.topologicalSort();
        expect.fail("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(CircularDependencyError);
        const err = e as CircularDependencyError;
        expect(err.cycle.length).toBeGreaterThan(2);
        expect(err.message).toContain("Circular dependency");
      }
    });

    it("detects cycle even with non-cyclic nodes present", () => {
      const g = new DependencyGraph();
      g.addNode("independent");
      g.addDependency("a", "b");
      g.addDependency("b", "a");
      expect(() => g.topologicalSort()).toThrow(CircularDependencyError);
    });

    it("self-loop is a cycle", () => {
      const g = new DependencyGraph();
      g.addDependency("a", "a");
      expect(() => g.topologicalSort()).toThrow(CircularDependencyError);
    });
  });

  describe("getDependencies / getNodes", () => {
    it("returns dependencies for a node", () => {
      const g = new DependencyGraph();
      g.addDependency("b", "a");
      g.addDependency("b", "c");
      const deps = g.getDependencies("b");
      expect(deps.has("a")).toBe(true);
      expect(deps.has("c")).toBe(true);
      expect(deps.size).toBe(2);
    });

    it("returns empty set for unknown node", () => {
      const g = new DependencyGraph();
      expect(g.getDependencies("x").size).toBe(0);
    });

    it("getNodes returns all registered nodes", () => {
      const g = new DependencyGraph();
      g.addNode("a");
      g.addDependency("c", "b");
      expect(g.getNodes().sort()).toEqual(["a", "b", "c"]);
    });
  });
});
