import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

// Resolve repo root: vitest runs from apps/web/, so go up two levels.
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../");

/**
 * FMT-1 guard (systemic-issues.json#FMT-1; QA findings DASH-07, FUND-09,
 * RPT-04, RPT-07, DATA-07, TEAM-07).
 *
 * Inline display formatting of an ALREADY-COMPUTED metric bypasses the single
 * source of truth for metric display:
 *   - engine `formatMetricValue(value, format)` (percent / months / ratio / multiple)
 *   - `@burnless/types.formatPercent`
 *   - React `useLocale().fmtCurrency` / `fmtCompact`
 *
 * Each call site that hand-rolls `${x.toFixed(n)}%` / `}pp` / `} mo` / `}x`,
 * or `(value * 100).toFixed(n)`, re-implements that rounding and the precision
 * drifts per site (a KPI card rounds toFixed(0) while its drill-down rounds
 * toFixed(1) — FUND-09; Board Mode rounds runway toFixed(1) while the hero card
 * uses Math.round — DASH-07).
 *
 * This walker mirrors no-hardcoded-currency.test.ts: a recursive grep across
 * the WHOLE apps/web/src tree (IRON RULE 1 — catch the bug anywhere it appears,
 * not just the known offenders), with a small, explained ALLOWLIST.
 *
 * Allowlisted (genuinely exempt):
 *   - The locale/percentage INPUT primitive that formats a user-entered ratio
 *     back into an editable string (not metric display).
 *   - Test files & fixtures (assert formatter output, not display code).
 *   - This guard file (contains the regexes themselves).
 *
 * NOTE: chart geometry (width/height/cx/cy/r/strokeDasharray/viewBox) does NOT
 * match these regexes — they end in `%|pp| mo|x`, not in geometry units — so no
 * geometry allowlist is needed for this pattern. The canonical formatter modules
 * (engine metric-registry.ts, types/index.ts formatPercent) live under packages/
 * and are outside this apps/web/src walk entirely.
 *
 * Prefix matching: an entry "foo/bar/" matches any path under that dir.
 */
const ALLOWED = [
  // ── This guard file ───────────────────────────────────────────────────────
  // Contains the regex patterns themselves — must not be flagged.
  "apps/web/src/__tests__/no-inline-metric-format.test.ts",

  // ── Percentage INPUT primitive ────────────────────────────────────────────
  // PercentageInput.tsx formats a user-entered RATIO (0-1) into an editable
  // percentage string for a form field (then strips trailing zeros). This is
  // input-control formatting, not metric DISPLAY — the value round-trips back
  // into onChange. Not a metric render surface.
  "apps/web/src/components/forms/primitives/PercentageInput.tsx",

  // ── Test files & fixtures ─────────────────────────────────────────────────
  // __tests__ dirs contain assertions that pin formatter output and reproduce
  // the offending idioms as fixtures, not as display code.
  "apps/web/src/__tests__/",
];

function isAllowed(line: string): boolean {
  return ALLOWED.some((prefix) => line.startsWith(prefix));
}

/** Strips grep matches that live in a __tests__ dir or *.test.* file anywhere in the tree. */
function isTestFile(line: string): boolean {
  const file = line.split(":")[0]!;
  return file.includes("/__tests__/") || /\.test\.(ts|tsx)$/.test(file);
}

describe("no-inline-metric-format (FMT-1)", () => {
  it("has no inline `${x.toFixed(n)}%|pp| mo|x` display-format idioms outside the shared formatters", () => {
    // Matches an already-computed value formatted inline with a display unit:
    //   `${x.toFixed(1)}%`  `${x.toFixed(1)}pp`  `${x.toFixed(1)} mo`  `${x.toFixed(1)}x`
    // Optional `}` (closing a template interpolation) + optional whitespace
    // between the toFixed() and the unit token.
    const raw = execSync(
      `grep -rEn '\\.toFixed\\([0-9]\\)[ }]*(%|pp| mo|x)' apps/web/src --include='*.ts' --include='*.tsx' || true`,
      { encoding: "utf8", cwd: REPO_ROOT, maxBuffer: 50 * 1024 * 1024 }
    );

    const offenders = raw
      .split("\n")
      .filter(Boolean)
      .filter((line) => !line.includes(".d.ts:"))
      .filter((line) => !isTestFile(line))
      .filter((line) => !isAllowed(line));

    expect(
      offenders,
      `Inline metric display-format idioms found (route through formatMetricValue / formatPercent / useLocale().fmtCurrency instead):\n` +
        `${offenders.length} offenders:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("has no inline `(value * 100).toFixed(n)` ratio→percent conversions in display code", () => {
    // The other half of FMT-1: converting a 0-1 ratio to a percentage inline
    // instead of going through ratioToPct + the shared formatter.
    const raw = execSync(
      `grep -rEn '\\* ?100\\)\\.toFixed\\(' apps/web/src --include='*.ts' --include='*.tsx' || true`,
      { encoding: "utf8", cwd: REPO_ROOT, maxBuffer: 50 * 1024 * 1024 }
    );

    const offenders = raw
      .split("\n")
      .filter(Boolean)
      .filter((line) => !line.includes(".d.ts:"))
      .filter((line) => !isTestFile(line))
      .filter((line) => !isAllowed(line));

    expect(
      offenders,
      `Inline ratio→percent conversions found (use ratioToPct + the shared formatter):\n` +
        `${offenders.length} offenders:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
