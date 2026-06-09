import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * DATE-04 guard — date display must route through the centralized locale date
 * formatter (`useLocale().fmtDate`/`fmtMonth` in React, `formatDate(value, locale)`
 * in @burnless/types), NOT a hardcoded `toLocaleDateString("en-US", …)` (which
 * ignores the user's locale preference) and NOT a bare `toLocaleDateString()` /
 * `toLocaleString()` (which silently uses the runtime's default locale).
 *
 * This mirrors the currency contract guarded by no-hardcoded-currency.test.ts —
 * date formatting is the parallel locale lens that had no guard.
 *
 * Walker style mimics no-hardcoded-currency.test.ts: recursive readdir + regex +
 * a small justified ALLOWLIST, with the offender file:line list printed in the
 * failed assertion so we can eyeball that it catches real violations.
 */

// vitest runs from apps/web/ — walk this package's src tree.
const WEB_SRC = path.resolve(import.meta.dirname, "..");

/**
 * Path substrings that are allowed to call toLocaleDateString/toLocaleString
 * with a literal locale (or bare). Each entry must say WHY. NEVER allowlist a
 * current offender — that would defeat the guard.
 */
const ALLOWED: { match: string; why: string }[] = [
  {
    match: "/components/locale/",
    why: "The centralized locale formatter itself (locale-context.tsx fmtDate/fmtMonth) and its tests legitimately call toLocaleDateString.",
  },
  {
    match: "/__tests__/",
    why: "Test files assert on formatter output / fixtures, not user-facing display code.",
  },
  {
    match: "no-hardcoded-date-format.test.ts",
    why: "This guard file contains the regex patterns themselves.",
  },
];

function isAllowed(relPath: string): boolean {
  return ALLOWED.some((a) => relPath.includes(a.match));
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
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

// Scope to the DATE method `toLocaleDateString` only. `toLocaleString` is
// overloaded for plain numbers (credits/shares counts) which is NOT a DATE-04
// concern, so it is deliberately excluded to avoid false positives.
//
// Hardcoded-locale: toLocaleDateString("en-US"…) — also catches the
// `opts.locale ?? "en-US"` default-fallback hardcoding.
const HARDCODED_LOCALE = /toLocaleDateString\s*\([^)]*["'][a-z]{2}-[A-Z]{2}["']/;
// Bare call: toLocaleDateString() / toLocaleDateString({…}) with no locale arg
// (uses the runtime default locale instead of the user's preference).
const BARE_LOCALE = /toLocaleDateString\s*\(\s*(?:\)|\{)/;

describe("no-hardcoded-date-format (DATE-04)", () => {
  const files = walk(WEB_SRC).filter((f) => !isAllowed(f));

  it("renders dates via the centralized locale formatter, not hardcoded toLocaleDateString('xx-XX')", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (HARDCODED_LOCALE.test(line)) {
          const rel = path.relative(WEB_SRC, file);
          offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      `Hardcoded-locale date formatting found (use useLocale().fmtDate / formatDate):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("does not use bare toLocaleDateString()/toLocaleString() (runtime default locale)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (BARE_LOCALE.test(line)) {
          const rel = path.relative(WEB_SRC, file);
          offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      `Bare toLocaleDateString()/toLocaleString() found (use the centralized locale formatter):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
