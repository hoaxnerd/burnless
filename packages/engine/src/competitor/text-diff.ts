import type { Alert } from "./types";

export interface TextDiff {
  addedLines: string[]; // capped to CAP
  removedLines: string[]; // capped to CAP
  addedCount: number; // uncapped
  removedCount: number; // uncapped
  truncated: boolean;
}

const CAP = 20;

function counts(lines: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l, (m.get(l) ?? 0) + 1);
  return m;
}

/**
 * Multiset line difference over normalized visible text. Order-insensitive and
 * O(n): a line moved but otherwise unchanged registers as no change. Returns
 * what text appeared (added) / disappeared (removed) — the useful monitoring
 * signal — with displayed lists capped at CAP (spec §3.2).
 */
export function diffText(prev: string, next: string): TextDiff {
  const prevLines = prev ? prev.split("\n") : [];
  const nextLines = next ? next.split("\n") : [];
  const prevCounts = counts(prevLines);
  const nextCounts = counts(nextLines);

  const added: string[] = [];
  for (const [line, n] of nextCounts) {
    const surplus = n - (prevCounts.get(line) ?? 0);
    for (let i = 0; i < surplus; i++) added.push(line);
  }
  const removed: string[] = [];
  for (const [line, p] of prevCounts) {
    const surplus = p - (nextCounts.get(line) ?? 0);
    for (let i = 0; i < surplus; i++) removed.push(line);
  }

  return {
    addedLines: added.slice(0, CAP),
    removedLines: removed.slice(0, CAP),
    addedCount: added.length,
    removedCount: removed.length,
    truncated: added.length > CAP || removed.length > CAP,
  };
}

/**
 * Tier-1 generic content-change alert. `label` is a human page label supplied
 * by the caller (e.g. "Pricing page"). Returns null when the diff is empty so
 * the pipeline emits no change. Kept as a dedicated helper (not folded into
 * evaluateRules) because a content change is not a structured `Change`.
 */
export function contentChangeAlert(diff: TextDiff, label: string): Alert | null {
  if (diff.addedCount === 0 && diff.removedCount === 0) return null;
  return {
    changeType: "content_changed",
    summary: `${label} content changed: +${diff.addedCount} / -${diff.removedCount} lines`,
    severity: "info",
    before: { lines: diff.removedLines, truncated: diff.removedLines.length < diff.removedCount },
    after: { lines: diff.addedLines, truncated: diff.addedLines.length < diff.addedCount },
  };
}
