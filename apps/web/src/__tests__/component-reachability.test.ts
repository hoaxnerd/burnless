// apps/web/src/__tests__/component-reachability.test.ts
//
// Guard for systemic issue WILD-03 ("Built-and-tested components left unwired —
// a recurring 'shipped dark' class") and QA findings TEAM-01, FUND-07, FUND-08,
// SET-07, SET-08, SCN-03 (the unwired-component cluster).
//
// Contract: every non-test React component file under app/(dashboard) or
// components/ must be REACHABLE from a render root (any page.tsx / layout.tsx)
// through the static import graph. A component that exists and is even
// unit-tested but is never imported by a rendered page is "shipped dark":
// invisible to users and undiscoverable by per-page browser QA.
//
// Detection style mirrors no-hardcoded-currency.test.ts: a recursive
// readdirSync walker + a small, explicitly-justified ALLOWLIST, and the failing
// assertion prints the full offender (unreached) list so violations are
// eyeballable.
//
// MODERATE COMPLEXITY: this builds a real import graph. An edge importer->target
// is only counted when at least one imported symbol is actually USED in
// comment-stripped code — so a live `import { AiFeaturesTab }` whose only JSX
// usage sits inside a commented-out block does NOT make the target reachable
// (this is exactly the SET-07 failure mode).

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

// __dirname = apps/web/src/__tests__  ->  src/
const SRC = resolve(__dirname, "..");
const SCAN_ROOTS = [join(SRC, "app"), join(SRC, "components")];

/**
 * Component files that are legitimately allowed to be import-unreachable.
 * Keep this list SMALL and per-entry justified. NEVER allowlist a current
 * offender (department-tree, investor-list, milestone-tracker, the AI settings
 * tabs) — that would defeat the guard.
 *
 * Paths are relative to src/ with forward slashes.
 */
const ALLOWLIST = new Set<string>([
  // ── Deliberately-deferred features (Batch I triage) ──────────────────────
  // Built but intentionally not mounted yet. Each is a conscious deferral, not a
  // dead-code orphan — kept (not deleted) so the work isn't lost. Remove from
  // this list when the feature is wired.
  //
  // Bank-sync (Plaid / Account-Aggregator) import UI — connectors are still
  // provider stubs (@burnless/engine bank-connectors). Imported by import-flow
  // behind an unmounted `showBankSync` flag; mount when bank sync ships.
  "app/(dashboard)/import/bank-sync-panel.tsx",
  // Landing social-proof / integrations bar — commented out in app/page.tsx
  // ("restore when live"); waiting on real integration logos/metrics.
  "components/landing/social-proof.tsx",
  // Deterministic (non-AI) expense/revenue insight fallbacks — commented out in
  // expenses-view / revenue-view ("disabled — redundant with AI-generated
  // insights"). Kept as the offline/AI-disabled fallback path.
  "app/(dashboard)/expenses/expense-insights.tsx",
  "app/(dashboard)/revenue/revenue-insights.tsx",
]);

function walk(dir: string): string[] {
  const acc: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) acc.push(...walk(full));
    else acc.push(full);
  }
  return acc;
}

/** Strip block and line comments so commented-out imports/usages don't count. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const isSourceFile = (f: string) =>
  /\.(tsx|ts)$/.test(f) && !/\.test\.(tsx|ts)$/.test(f) && !/\.d\.ts$/.test(f);

const ALL_FILES = SCAN_ROOTS.flatMap(walk).filter(isSourceFile);
const FILE_SET = new Set(ALL_FILES);

/** Resolve a relative or `@/`-aliased import spec to an on-disk source file. */
function resolveImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // bare package import — outside the scanned tree
  const candidates = [
    base + ".tsx",
    base + ".ts",
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      /* not this candidate */
    }
  }
  return null;
}

// `import X from "..."` / `import { X } from "..."` / `import "..."` (side-effect)
const IMPORT_RE =
  /import\s+(?:type\s+)?(?:([\s\S]*?)\s+from\s+)?["']([^"']+)["']/g;
// `export { X } from "..."` / `export * from "..."` re-exports (barrels)
const REEXPORT_RE = /export\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+["']([^"']+)["']/g;
// `import("...")` dynamic / lazy imports (React.lazy, next/dynamic, withLazyChart)
const DYNAMIC_IMPORT_RE = /import\(\s*["']([^"']+)["']\s*\)/g;

/** Build importer -> Set(target) edges, counting only used symbols. */
function buildEdges(): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>();
  for (const f of ALL_FILES) {
    const code = stripComments(readFileSync(f, "utf8"));
    const codeNoImports = code.replace(IMPORT_RE, "");
    const set = new Set<string>();

    // 1. Static `import ... from` edges — counted only if a binding is USED in
    //    live (comment-stripped) code, so a live import whose only reference is
    //    inside a commented-out block (SET-07's AI tabs) does NOT create an edge.
    let m: RegExpExecArray | null;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(code))) {
      const clause = m[1] || "";
      const target = resolveImport(f, m[2]!);
      if (!target || !FILE_SET.has(target)) continue;

      const symbols: string[] = [];
      const named = clause.match(/\{([^}]*)\}/);
      if (named) {
        for (const s of named[1]!.split(",")) {
          const name = s.trim().split(/\s+as\s+/).pop()!.trim();
          if (name && /^[A-Za-z_]/.test(name)) symbols.push(name);
        }
      }
      const rest = clause
        .replace(/\{[^}]*\}/, "")
        .replace(/\*\s+as\s+\w+/, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const d of rest) if (/^[A-Za-z_]/.test(d)) symbols.push(d);

      const used =
        symbols.length === 0 ||
        symbols.some((s) =>
          new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(
            codeNoImports
          )
        );
      if (used) set.add(target);
    }

    // 2. Barrel re-export edges (`export { X } from "./x"`) — always an edge:
    //    if the barrel is reached, the re-exported module is reachable.
    REEXPORT_RE.lastIndex = 0;
    while ((m = REEXPORT_RE.exec(code))) {
      const target = resolveImport(f, m[1]!);
      if (target && FILE_SET.has(target)) set.add(target);
    }

    // 3. Dynamic / lazy import edges (`import("./x")`) — always an edge.
    DYNAMIC_IMPORT_RE.lastIndex = 0;
    while ((m = DYNAMIC_IMPORT_RE.exec(code))) {
      const target = resolveImport(f, m[1]!);
      if (target && FILE_SET.has(target)) set.add(target);
    }

    edges.set(f, set);
  }
  return edges;
}

// Next.js App Router convention files are loaded by the framework, not imported,
// so they are render roots in their own right (and never "orphans").
const CONVENTION_FILE_RE =
  /\/(page|layout|error|loading|not-found|global-error|template|default)\.tsx$/;

/** Does this .tsx file define/export a React component (Capitalized export)? */
function definesComponent(f: string): boolean {
  if (!f.endsWith(".tsx")) return false;
  const code = stripComments(readFileSync(f, "utf8"));
  return (
    /export\s+(?:default\s+)?function\s+[A-Z]/.test(code) ||
    /export\s+default\s+function\b/.test(code) ||
    /export\s+const\s+[A-Z][A-Za-z0-9]*\s*[:=]/.test(code)
  );
}

describe("component-reachability (WILD-03 no-dark-ship guard)", () => {
  const edges = buildEdges();
  // Roots = every framework-loaded convention file (page/layout/error/loading/…).
  const roots = ALL_FILES.filter((f) => CONVENTION_FILE_RE.test(f));

  it("has render roots to BFS from (sanity)", () => {
    expect(roots.length).toBeGreaterThan(5);
  });

  it("every component under app/(dashboard) or components/ is reachable from a page/layout root", () => {
    // BFS over the used-symbol import graph.
    const reached = new Set<string>(roots);
    const queue = [...roots];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const next of edges.get(cur) ?? []) {
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }

    const unreached = ALL_FILES.filter((f) => {
      if (reached.has(f)) return false;
      // Convention files are framework-loaded, never "orphans".
      if (CONVENTION_FILE_RE.test(f)) return false;
      const rel = relative(SRC, f).split("\\").join("/");
      const underTarget =
        rel.startsWith("app/(dashboard)/") || rel.startsWith("components/");
      if (!underTarget) return false;
      if (ALLOWLIST.has(rel)) return false;
      return definesComponent(f);
    });

    const offenders = unreached
      .map((f) => relative(SRC, f).split("\\").join("/"))
      .sort();

    expect(
      offenders,
      `Unwired (unreachable) component files — built but no page/layout renders them ` +
        `(WILD-03 'shipped dark'):\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
