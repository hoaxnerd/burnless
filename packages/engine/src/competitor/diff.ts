import type { Change } from "./types";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function walk(prev: unknown, next: unknown, path: string[], out: Change[]): void {
  if (deepEqual(prev, next)) return;

  const prevIsObj = isObject(prev);
  const nextIsObj = isObject(next);

  if (!prevIsObj || !nextIsObj) {
    out.push({ kind: "modified", path, before: prev, after: next });
    return;
  }

  const keys = Array.from(new Set([...Object.keys(prev), ...Object.keys(next)])).sort();
  for (const key of keys) {
    const hasPrev = key in prev;
    const hasNext = key in next;
    const childPath = [...path, key];
    if (hasPrev && !hasNext) {
      out.push({ kind: "removed", path: childPath, before: prev[key] });
    } else if (!hasPrev && hasNext) {
      out.push({ kind: "added", path: childPath, after: next[key] });
    } else {
      walk(prev[key], next[key], childPath, out);
    }
  }
}

export function diffStructured(prev: unknown, next: unknown): Change[] {
  const out: Change[] = [];
  walk(prev, next, [], out);
  return out;
}
