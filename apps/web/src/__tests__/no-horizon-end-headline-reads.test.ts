import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

// Resolve repo root: vitest runs from apps/web/, so go up two levels.
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../");

/**
 * FMT-2 guard (systemic-issues.json#FMT-2; QA finding RPT-03).
 *
 * Phase B horizon contract (CLAUDE.md): headline KPIs must be read at the REAL
 * current calendar month — `data.currentMonth` — via a `.find(m => m.month ===
 * currentMonth)` accessor, NOT at the END of the now-full-horizon series.
 *
 * After Phase B, computeDashboardData projects the full horizon (carry-forward
 * fills thin categories all the way to horizonMonths), so the LAST element of a
 * metric series is an END-OF-HORIZON projection, not "today". Report/data-room
 * pages that predate the `currentMonth` return value still grab `series[length-1]`
 * (or `.at(-1)`) as "latest", surfacing projected future cash/runway as the
 * CURRENT figure — the 8-month report vs 13-month dashboard divergence (RPT-03).
 *
 * HEURISTIC: this walks the "as-of-today" report + data-room + dashboard VIEW
 * surfaces (per IRON RULE 1, the whole relevant view tree — not just the known
 * offenders) and fails any `[<series>.length - 1]` / `.at(-1)` indexing where
 * `<series>` is a known ComputedMetrics series name. Headline reads must move to
 * a `valueAtMonth(series, data.currentMonth)` accessor instead.
 *
 * The known metric-series names (from ComputedMetrics / DashboardData):
 *   cashPosition, netBurnRate, cashRunwayMonths, grossBurnRate,
 *   mrr, arr, totalRevenue, grossMarginPercent, totalCustomers, runway
 *
 * Scope: app/(dashboard)/data-room, app/(dashboard)/reports,
 *        app/(dashboard)/dashboard (the headline-rendering view surfaces).
 *
 * Allowlist: chart geometry / sparkline-tail labels (a chart legitimately wants
 * the last plotted point), and shared accessor helpers, are matched only when
 * the series name is one of the known metric names AND the file is a view page —
 * chart components under components/charts/ are outside this view-scoped walk.
 */
const SERIES_NAMES = [
  "cashPosition",
  "netBurnRate",
  "cashRunwayMonths",
  "grossBurnRate",
  "mrr",
  "arr",
  "totalRevenue",
  "grossMarginPercent",
  "totalCustomers",
  "runway",
];

// View directories that render headline "as-of-today" KPIs.
const VIEW_DIRS = [
  "apps/web/src/app/(dashboard)/data-room",
  "apps/web/src/app/(dashboard)/reports",
  "apps/web/src/app/(dashboard)/dashboard",
];

const ALLOWED = [
  // This guard file (contains the series names + regexes).
  "apps/web/src/__tests__/no-horizon-end-headline-reads.test.ts",
  // Test files / fixtures.
  "apps/web/src/__tests__/",
];

function isAllowed(line: string): boolean {
  return ALLOWED.some((prefix) => line.startsWith(prefix));
}

function isTestFile(line: string): boolean {
  const file = line.split(":")[0];
  return file.includes("/__tests__/") || /\.test\.(ts|tsx)$/.test(file);
}

describe("no-horizon-end-headline-reads (FMT-2, heuristic)", () => {
  it("reads no metric series at [length - 1] / .at(-1) for headline values (use data.currentMonth)", () => {
    const seriesAlt = SERIES_NAMES.join("|");
    // Two end-of-horizon idioms on a known metric series:
    //   <series>.length - 1]      (subscript indexing the tail)
    //   <series>.at(-1)
    const pattern = `\\b(${seriesAlt})(\\.length - 1\\]|\\.at\\(-1\\))`;
    const dirArgs = VIEW_DIRS.map((d) => `'${REPO_ROOT}/${d}'`).join(" ");

    const raw = execSync(
      `grep -rEn '${pattern}' ${dirArgs} --include='*.ts' --include='*.tsx' || true`,
      { encoding: "utf8", cwd: REPO_ROOT, maxBuffer: 50 * 1024 * 1024 }
    );

    const offenders = raw
      .split("\n")
      .filter(Boolean)
      // Normalize absolute paths back to repo-relative for stable reporting + allowlist.
      .map((line) => line.replace(`${REPO_ROOT}/`, ""))
      .filter((line) => !line.includes(".d.ts:"))
      .filter((line) => !isTestFile(line))
      .filter((line) => !isAllowed(line));

    expect(
      offenders,
      `Headline metric-series reads at end-of-horizon found (read at data.currentMonth via valueAtMonth instead):\n` +
        `${offenders.length} offenders:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
