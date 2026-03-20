/**
 * Dependency graph with topological sort and cycle detection.
 *
 * Used by:
 * - computeAllForecastLines() to resolve percentage_of / custom_formula chains
 * - computeAllMetrics() to ensure correct ordering when custom metrics are added
 */

/** Error thrown when a circular dependency is detected. */
export class CircularDependencyError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(" → ")}`);
    this.name = "CircularDependencyError";
  }
}

/**
 * A directed acyclic graph (DAG) for dependency resolution.
 *
 * Nodes are string identifiers. Edges go from dependent → dependency
 * (i.e., "A depends on B" means an edge from A to B).
 */
export class DependencyGraph {
  /** node → set of nodes it depends on */
  private edges = new Map<string, Set<string>>();

  /** Register a node (even if it has no dependencies). */
  addNode(id: string): void {
    if (!this.edges.has(id)) {
      this.edges.set(id, new Set());
    }
  }

  /** Declare that `dependent` depends on `dependency`. */
  addDependency(dependent: string, dependency: string): void {
    this.addNode(dependent);
    this.addNode(dependency);
    this.edges.get(dependent)!.add(dependency);
  }

  /** Get direct dependencies of a node. */
  getDependencies(id: string): ReadonlySet<string> {
    return this.edges.get(id) ?? new Set();
  }

  /** Get all registered node IDs. */
  getNodes(): string[] {
    return Array.from(this.edges.keys());
  }

  /**
   * Return nodes in topological order (dependencies before dependents).
   * Throws CircularDependencyError if a cycle exists.
   *
   * Uses Kahn's algorithm for a stable, deterministic sort.
   */
  topologicalSort(): string[] {
    // Build in-degree map and reverse adjacency (dependency → dependents)
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, Set<string>>();

    for (const [node, deps] of this.edges) {
      if (!inDegree.has(node)) inDegree.set(node, 0);
      if (!dependents.has(node)) dependents.set(node, new Set());

      for (const dep of deps) {
        if (!inDegree.has(dep)) inDegree.set(dep, 0);
        if (!dependents.has(dep)) dependents.set(dep, new Set());
        // dep → node (node depends on dep, so dep must come first)
        dependents.get(dep)!.add(node);
        inDegree.set(node, (inDegree.get(node) ?? 0) + 1);
      }
    }

    // Seed queue with zero-in-degree nodes (sorted for determinism)
    const queue: string[] = [];
    for (const [node, deg] of inDegree) {
      if (deg === 0) queue.push(node);
    }
    queue.sort();

    const sorted: string[] = [];

    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);

      for (const dependent of dependents.get(node) ?? []) {
        const newDeg = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) {
          // Insert in sorted position for determinism
          const idx = queue.findIndex((q) => q > dependent);
          if (idx === -1) queue.push(dependent);
          else queue.splice(idx, 0, dependent);
        }
      }
    }

    // If not all nodes were emitted, there's a cycle
    if (sorted.length !== inDegree.size) {
      const cycle = this.findCycle(sorted, inDegree);
      throw new CircularDependencyError(cycle);
    }

    return sorted;
  }

  /** Extract a human-readable cycle from remaining unvisited nodes. */
  private findCycle(
    visited: string[],
    inDegree: Map<string, number>
  ): string[] {
    const visitedSet = new Set(visited);
    const remaining = Array.from(inDegree.keys()).filter(
      (n) => !visitedSet.has(n)
    );

    if (remaining.length === 0) return [];

    // DFS from first remaining node to find the cycle
    const path: string[] = [];
    const onStack = new Set<string>();

    const dfs = (node: string): string[] | null => {
      path.push(node);
      onStack.add(node);

      for (const dep of this.edges.get(node) ?? []) {
        if (!visitedSet.has(dep)) {
          if (onStack.has(dep)) {
            // Found cycle — extract it
            const cycleStart = path.indexOf(dep);
            return [...path.slice(cycleStart), dep];
          }
          const result = dfs(dep);
          if (result) return result;
        }
      }

      path.pop();
      onStack.delete(node);
      return null;
    };

    for (const start of remaining) {
      const cycle = dfs(start);
      if (cycle) return cycle;
    }

    // Fallback: just show the remaining nodes
    return remaining;
  }
}
