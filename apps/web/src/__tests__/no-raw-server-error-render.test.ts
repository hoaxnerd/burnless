import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * GUARD [ERR-02, WILD-01, VAL-04]: Client forms must not pipe a server-supplied
 * `error` string (from a parsed response body) — nor a thrown `Error.message` —
 * straight into a setX(...) state setter that is then rendered as visible JSX.
 *
 * Why: the server can emit raw Zod JSON (ERR-01) or a stack-ish Error.message;
 * rendering it verbatim shows machine output to the user. The systemic fix is a
 * single client normalizer (a future `lib/api-error.ts` exporting
 * `extractApiError` / `toUserMessage`); every error sink must route through it.
 *
 * Detection: any `set<Name>( … )` whose argument is one of
 *   - `<src>.error` where src ∈ body|json|data|res|errData|err|result|e|resp|response
 *   - `<x>.message` (thrown Error piped in)
 * UNLESS the offending token is wrapped in `toUserMessage(` / `extractApiError(`.
 *
 * RED NOW: ~20+ files surface raw server/Error text. When the normalizer lands
 * and call sites wrap their argument, this turns GREEN.
 *
 * Mirrors apps/web/src/__tests__/no-hardcoded-currency.test.ts (recursive walk +
 * regex + small justified ALLOWLIST + offenders printed in the assertion).
 */

const WEB_SRC = path.resolve(import.meta.dirname, "..");

/**
 * Path substrings that are allowed to contain a raw error sink.
 * Each entry MUST justify WHY. Never allowlist a current offender.
 */
const ALLOWED: { match: string; why: string }[] = [
  {
    match: "/lib/api-error.ts",
    why: "Future shared client error normalizer (extractApiError/toUserMessage) — the helper itself.",
  },
  {
    match: "/lib/client-error.ts",
    why: "Alternate name for the shared client error normalizer helper.",
  },
  {
    match: "/__tests__/",
    why: "Test files (fixtures/assertions, not production error rendering).",
  },
  {
    match: ".test.tsx",
    why: "Test files.",
  },
];

function isAllowed(relPath: string): boolean {
  const norm = "/" + relPath.split(path.sep).join("/");
  return ALLOWED.some((a) => norm.includes(a.match));
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

// A line is "wrapped" (safe) if the raw token is fed through the normalizer.
const WRAPPED = /(toUserMessage|extractApiError)\s*\(/;

// setX( ... <src>.error ... ) — server-supplied error string into a state setter.
const SET_DOT_ERROR =
  /set[A-Z][A-Za-z]*\([^;]*\b(body|json|data|res|resp|response|errData|err|error|result|e|payload)\.error\b/;

// setX( ... .message ... ) — thrown Error.message into a state setter.
const SET_DOT_MESSAGE = /set[A-Z][A-Za-z]*\([^;]*\.message\b/;

describe("no raw server/Error text rendered into client error state (ERR-02)", () => {
  it("routes every client error sink through a shared normalizer", () => {
    const files = walk(WEB_SRC);
    const offenders: string[] = [];

    for (const file of files) {
      const rel = path.relative(WEB_SRC, file);
      if (isAllowed(rel)) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (WRAPPED.test(line)) return; // normalized → safe
        if (SET_DOT_ERROR.test(line) || SET_DOT_MESSAGE.test(line)) {
          offenders.push(`apps/web/src/${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(
      offenders,
      `Client error sinks rendering raw server/Error text (route through a shared ` +
        `extractApiError/toUserMessage helper) — ${offenders.length} found:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
