import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * WILD-04 guard — no raw `console.*` in production code paths.
 *
 * Scope (tight, to avoid false alarms):
 *   (1) The pure engine package (packages/engine/src) — it is meant to be
 *       I/O-free; ANY console.* is a violation.
 *   (2) "use client" component files in apps/web/src — these ship to the
 *       browser console.
 *
 * Server-side apps/web code has a structured `logger` (lib/logger.ts) and is
 * deliberately out of scope here (the broader rollout is tracked separately).
 *
 * ALLOWLIST: the logger module itself + test files. Comments are stripped before
 * matching so a `console.log(...)` inside a JSDoc usage-example does not trip.
 *
 * Mirrors the no-currency-in-engine.test.ts walker style; offender file:line list
 * is printed in the failed assertion.
 */

const WEB_SRC = path.resolve(import.meta.dirname, "..");
const ENGINE_SRC = path.resolve(import.meta.dirname, "../../../../packages/engine/src");

const CONSOLE_RE = /\bconsole\s*\.\s*(log|error|warn|info|debug|trace)\s*\(/;

function isAllowed(file: string): boolean {
  return (
    file.includes("/__tests__/") ||
    file.endsWith(".test.ts") ||
    file.endsWith(".test.tsx") ||
    // The single sanctioned logging module.
    file.endsWith("/lib/logger.ts") ||
    file.endsWith("no-console-in-production.test.ts")
  );
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
      walk(full, acc);
    } else if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".d.ts")
    ) {
      acc.push(full);
    }
  }
  return acc;
}

/** Remove // line comments and block comments so example code in JSDoc is ignored. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function isUseClient(src: string): boolean {
  // "use client" / 'use client' directive in the first non-empty lines.
  const head = src.slice(0, 200);
  return /^\s*["']use client["']/m.test(head);
}

function scan(file: string): string[] {
  const raw = readFileSync(file, "utf8");
  const stripped = stripComments(raw);
  const hits: string[] = [];
  stripped.split("\n").forEach((line, i) => {
    if (CONSOLE_RE.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
  });
  return hits;
}

describe("no-console-in-production (WILD-04)", () => {
  it("has no console.* in the pure engine package (packages/engine/src)", () => {
    const offenders = walk(ENGINE_SRC)
      .filter((f) => !isAllowed(f))
      .flatMap(scan)
      .map((h) => path.relative(path.resolve(ENGINE_SRC, "../../.."), h));

    expect(
      offenders,
      `console.* found in pure engine (engine must be I/O-free):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it('has no console.* in "use client" component files (apps/web/src)', () => {
    const offenders = walk(WEB_SRC)
      .filter((f) => !isAllowed(f))
      .filter((f) => isUseClient(readFileSync(f, "utf8")))
      .flatMap(scan)
      .map((h) => path.relative(WEB_SRC, h));

    expect(
      offenders,
      `console.* found in "use client" files (ships to browser; route through a logger):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
