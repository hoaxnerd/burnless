import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * DFL-01 guard (HEURISTIC) — client components must not hand-roll read-state from
 * a `useEffect` + `apiFetch`/`fetch` "local snapshot" (useState fed by a fetch
 * inside an effect). A private per-component snapshot is keyed to nothing shared,
 * so a mutation on surface A never revalidates the read on surface B — the
 * "stale until reload" class (FUND-06 / SCN-04 / SCN-05 / DATA-02). The shared
 * SWR layer (apps/web/src/lib/swr) is the intended read path.
 *
 * Heuristic detection: a file is flagged when it contains ALL of:
 *   - useEffect(
 *   - apiFetch( OR a bare fetch(
 *   - a setState call (set[A-Z]…(  — the snapshot sink)
 * and it does NOT import from @/lib/swr (i.e. it is not already on the cache).
 *
 * Because this is a structural heuristic (not an exact AST proof), the count is
 * approximate; it deliberately catches the real hand-rolled-read offenders and
 * prints them. ALLOWLIST holds only the genuinely-exempt files: the SWR layer
 * itself, the three sanctioned SWR consumers, and the one intentional header-less
 * raw GET (scenario-context, per DFL-02). NEVER allowlist a real offender.
 */

const WEB_SRC = path.resolve(import.meta.dirname, "..");
const SCAN_ROOTS = [
  path.join(WEB_SRC, "app", "(dashboard)"),
  path.join(WEB_SRC, "components"),
];

/** Path substrings allowed to hand-roll a fetch-in-effect read. Each needs a WHY. */
const ALLOWED: { match: string; why: string }[] = [
  {
    match: "/lib/swr/",
    why: "The shared SWR read-cache layer itself (fetcher/hooks/mutations/provider).",
  },
  {
    match: "/__tests__/",
    why: "Test files, not production read surfaces.",
  },
  {
    match: "/settings/billing-tab.tsx",
    why: "Sanctioned SWR consumer (useBilling) — already on the shared cache (DFL-01 spread note).",
  },
  {
    match: "/settings/ai-dashboard-tab.tsx",
    why: "Sanctioned SWR consumer (useAiDashboard) — already on the shared cache.",
  },
  {
    match: "/funding/investor-list.tsx",
    why: "Sanctioned consumer using raw useSWR — already on the shared cache.",
  },
  {
    match: "/scenarios/scenario-context.tsx",
    why: "Intentional header-less adopt-cookie GET (DFL-02): must bypass apiFetch by design; not a snapshot read to migrate.",
  },
];

function isAllowed(file: string): boolean {
  return ALLOWED.some((a) => file.includes(a.match));
}

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, acc);
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

const USE_EFFECT = /useEffect\s*\(/;
const FETCH_CALL = /\bapiFetch\s*\(|(?<![.\w])fetch\s*\(/;
const SET_STATE = /\bset[A-Z][A-Za-z0-9]*\s*\(/;
const IMPORTS_SWR = /from\s+["']@\/lib\/swr/;

describe("no-handrolled-read-snapshots (DFL-01, heuristic)", () => {
  it("does not hand-roll useEffect+fetch local-snapshot reads outside the shared SWR layer", () => {
    const files = SCAN_ROOTS.flatMap((root) => walk(root)).filter(
      (f) => !isAllowed(f),
    );

    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (IMPORTS_SWR.test(src)) continue; // already on the shared cache
      if (USE_EFFECT.test(src) && FETCH_CALL.test(src) && SET_STATE.test(src)) {
        offenders.push(path.relative(WEB_SRC, file));
      }
    }

    expect(
      offenders,
      `Hand-rolled fetch-in-effect read snapshots found (migrate to @/lib/swr hooks):\n${offenders.join("\n")}\n(count: ${offenders.length})`,
    ).toEqual([]);
  });
});
