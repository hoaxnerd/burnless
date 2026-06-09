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
  {
    match: "/team/headcount-form.tsx",
    why: "Heuristic false-positive: its useEffect only syncs local form state from the server-rendered `departments` prop (RSC-supplied, not a read-snapshot fetch), and its only apiFetch is the create/edit MUTATION. No read-in-effect to migrate; the form deliberately receives dropdown data from its RSC parent rather than client-fetching it.",
  },
  {
    match: "/ai/page.tsx",
    why: "AI companion: every apiFetch is chat-session logic (chat/history list+restore, per-conversation reload, insights POST-regen) owned by the chat-session provider — not a shareable cross-surface read snapshot, and there is no GET-read SWR hook for chat history. The flagged effects load/restore an in-progress conversation, which a generic SWR cache key would clobber. Migrating chat/scenario logic is explicitly out of scope for this surface.",
  },
  // ── Data-context-layer ratchet entries ─────────────────────────────────────
  // These are NOT ad-hoc per-component snapshots: each is a single React CONTEXT
  // PROVIDER (or a bespoke cache hook) that OWNS its domain's fetch+cache for its
  // whole subtree — it is itself the single source. Converting to a plain SWR
  // read would be a larger architectural change (optimistic writes, retry/save
  // queues, localStorage merge, grace-period tickers) with no staleness symptom,
  // because the provider is mounted once and feeds its value down via context.
  {
    match: "/components/locale/locale-context.tsx",
    why: "LocaleProvider — the app-wide currency/locale data-layer. Its one effect fetches /api/company once and transforms the row into LocaleSettings fed to every formatter via context. It is the single source for its subtree, not a per-component snapshot; currency changes already drive a full settings flow, so there is no cross-surface staleness symptom to fix.",
  },
  {
    match: "/components/providers/metrics-context.tsx",
    why: "MetricsProvider — THE single source for card-mode switching + per-card scenario/slot overrides. It does far more than a read: merges /api/dashboard-preferences with localStorage, applies optimistic per-card writes, and owns a retry+beforeunload save queue. A plain useDashboardPreferences SWR read would discard that write machinery; it is the context/data-layer owner, not a snapshot.",
  },
  {
    match: "/components/providers/page-layout-context.tsx",
    why: "PageLayoutProvider — per-pageId layout data-layer. Owns its own save queue, beforeunload guard, and server-initial-layouts hydration; its lone read effect only runs when no server-initial data was supplied. Single provider owning its domain's persistence, not a per-component read snapshot.",
  },
  {
    match: "/components/ai/ai-feature-context.tsx",
    why: "AiFeatureProvider — single source for AI feature flags + credits + (masked) provider config from /api/ai-features. Owns optimistic updateFlags with rollback; there is no GET-read SWR hook for ai-features, and the provider is mounted once and fed down via context. Data-layer owner, not a snapshot.",
  },
  {
    match: "/components/ai/use-insight-cache.ts",
    why: "Bespoke stale-while-revalidate insight cache: grace-period countdown ticker, mutation-bus subscription, single-flight auto-regen, and a POST regen path. A generic SWR cache key would clobber the in-progress generation/grace state (same rationale as ai/page.tsx). It IS the insight read+cache layer, not an ad-hoc snapshot.",
  },
  {
    match: "/components/ai/use-proactive-alerts.ts",
    why: "Heuristic false-positive: it has no read-snapshot useState — the matched `set[A-Z]` is `setTimeout`, and the alerts payload is consumed-and-discarded into staggered toasts with sessionStorage dedupe (fire-once-per-session side effect), not stored for render. SWR revalidation would re-fire toasts. Nothing to migrate.",
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
