import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Architectural guard (AI reliability).
 *
 * Root cause of an intermittent-AI-failure bug: real-generation code built RAW
 * providers via `createProvider()` / `getProvider()` (the unwrapped factories in
 * `packages/ai/src/providers`), bypassing the resilience seam
 * `resolveResilientProvider()` in `packages/ai/src/routing.ts` — which is what
 * adds retry + circuit-breaking + usage logging. Raw construction silently drops
 * all of that, so a transient provider hiccup surfaced as a hard failure.
 *
 * This guard fails if any real-generation source file reintroduces a bare
 * `createProvider(` / `getProvider(` call. All generation MUST go through
 * `resolveResilientProvider()` (or the routing wrappers built on it:
 * `createProviderForTier` / `getProviderForFeature` / `getProviderForTier`).
 *
 * Mirrors the no-hardcoded-currency / no-currency-in-engine scanners: walk
 * source, strip comments, match a forbidden pattern, allowlist with reasons.
 */

// vitest runs from apps/web/, so go up two levels to the repo root.
const REPO_ROOT = join(import.meta.dirname, "../../../../");

// Directories to scan (real-generation source).
const SCAN_DIRS = ["packages/ai/src", "apps/web/src"];

/**
 * Files allowed to call the raw `createProvider(` / `getProvider(` factories.
 * Each entry is a repo-relative path with a comment explaining WHY. Exact-path
 * matching (not prefix) so allowlisting is deliberate and narrow.
 */
const ALLOWED = new Set([
  // ── The factory itself ────────────────────────────────────────────────────
  // Defines createProvider/getProvider and calls them internally. This IS the
  // raw factory; it is what the resilient seam wraps.
  "packages/ai/src/providers/index.ts",

  // ── The resilience seam ───────────────────────────────────────────────────
  // resolveResilientProvider() legitimately calls the raw createProvider() and
  // then wraps it in the resilience layer. This is the one sanctioned call site.
  "packages/ai/src/routing.ts",

  // ── One-off connection tests (raw is intentional) ─────────────────────────
  // These verify a user-supplied provider config can connect at all; they make a
  // single throwaway call and must NOT retry/circuit-break, so raw is correct.
  "apps/web/src/app/api/ai-features/test-connection/route.ts",
  "apps/web/src/app/api/ai-features/providers/[id]/test/route.ts",

  // ── Unrelated `getProvider` (name collision) ──────────────────────────────
  // The email subsystem defines and calls its OWN getProvider() resolving an
  // EmailProvider — nothing to do with the AI LLM factory. Allowlisted so the
  // name-collision is not a false positive.
  "apps/web/src/lib/email/index.ts",
]);

// Bare `createProvider(` / `getProvider(` calls. Word-boundary + `(` lookahead
// excludes the legitimate wrappers and same-prefix collisions:
//   createProviderForTier / createProviderSchema
//   getProviderForFeature / getProviderForTier / getProviderByType
//   getProviderRateLimitConfig / resolveResilientProvider
const FORBIDDEN = /(?<![A-Za-z0-9_])(?:create|get)Provider\s*\(/;

function sanitize(src: string): string {
  // Strip line comments.
  let s = src
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  // Strip block comments (JSDoc etc.).
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");
  return s;
}

function walk(absDir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const p = join(absDir, entry.name);
    if (entry.isDirectory()) {
      walk(p, out);
    } else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".d.ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      out.push(p);
    }
  }
}

describe("ai generation uses the resilient provider seam", () => {
  it("no real-generation source calls the raw createProvider()/getProvider() factories", () => {
    const files: string[] = [];
    for (const dir of SCAN_DIRS) walk(join(REPO_ROOT, dir), files);

    const offenders = files
      .filter((p) => FORBIDDEN.test(sanitize(readFileSync(p, "utf8"))))
      .map((p) => relative(REPO_ROOT, p))
      .filter((rel) => !ALLOWED.has(rel))
      .sort();

    expect(
      offenders,
      `Raw provider construction found in real-generation code:\n` +
        offenders.map((o) => `  - ${o}`).join("\n") +
        `\n\nReal-generation code must NOT call createProvider()/getProvider() directly — ` +
        `those bypass the resilience seam (retry + circuit breaker + usage logging). ` +
        `Use resolveResilientProvider() from @burnless/ai (packages/ai/src/routing.ts), ` +
        `or the wrappers built on it (createProviderForTier / getProviderForFeature / getProviderForTier). ` +
        `If a file legitimately needs a raw provider (the factory itself or a one-off connection test), ` +
        `add it to the ALLOWED set in this test with a justifying comment.`
    ).toEqual([]);
  });
});
