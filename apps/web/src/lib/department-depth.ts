import { eq, and } from "drizzle-orm";
import { db, departments } from "@burnless/db";

export const DEPT_MAX_DEPTH = 3;

/**
 * Walk the parent chain to determine the depth a node would be at.
 * Returns the depth a NEW node would land at if attached to `parentId`,
 * i.e. parentDepth + 1. If `parentId` is null, returns 1 (root).
 *
 * Returns Infinity if a cycle or missing parent is detected (caller should treat as error).
 */
export async function depthAtParent(
  companyId: string,
  parentId: string | null,
): Promise<number> {
  if (!parentId) return 1;

  let depth = 1; // depth of the new node = parent depth + 1; we'll add as we walk
  let currentId: string | null = parentId;
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) return Infinity;
    visited.add(currentId);
    depth++;
    if (depth > DEPT_MAX_DEPTH + 1) return depth;

    const [row]: { parentId: string | null }[] = await db
      .select({ parentId: departments.parentId })
      .from(departments)
      .where(and(eq(departments.id, currentId), eq(departments.companyId, companyId)));
    if (!row) return Infinity;
    currentId = row.parentId;
  }
  return depth;
}

/**
 * Compute the maximum subtree depth rooted at `nodeId` (inclusive).
 * Used by PATCH when moving a node to a new parent — the moved subtree
 * must fit within the cap.
 */
export async function subtreeDepthFrom(
  companyId: string,
  nodeId: string,
): Promise<number> {
  // BFS — adjacency list
  const allDepts = await db
    .select({ id: departments.id, parentId: departments.parentId })
    .from(departments)
    .where(eq(departments.companyId, companyId));
  const childrenByParent = new Map<string, string[]>();
  for (const d of allDepts) {
    if (d.parentId) {
      const arr = childrenByParent.get(d.parentId) ?? [];
      arr.push(d.id);
      childrenByParent.set(d.parentId, arr);
    }
  }
  let maxDepth = 1;
  function walk(id: string, depth: number) {
    if (depth > maxDepth) maxDepth = depth;
    for (const child of childrenByParent.get(id) ?? []) {
      walk(child, depth + 1);
    }
  }
  walk(nodeId, 1);
  return maxDepth;
}
