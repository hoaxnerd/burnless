import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

// Resolve repo root: vitest runs from apps/web/, so go up two levels.
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../");

/**
 * Guard: financial math lives in @burnless/engine, not inline in the app.
 *
 * The dashboard, expenses, team, revenue and funding surfaces must all derive
 * the SAME number from the SAME engine helper so two pages can never disagree
 * (the Team-vs-Expenses people-cost bug that motivated this guard). App code
 * should call the engine helpers instead:
 *   - pctChange / ratioChange   (month-over-month change)
 *   - pctOfTotal                (share of a total)
 *   - ratioToPct                (0-1 rate → 0-100 for display)
 *   - annualize                 (monthly → annual run-rate)
 *   - dSum / dMul / dDiv / dAdd (precise aggregation)
 *
 * This guard targets the two unambiguous, drift-prone idioms that were
 * eliminated. It is intentionally narrow (regex, not a full AST) — pure
 * geometry (bar widths, arc degrees) and rate→% display conversions are
 * enforced by review, not by this test.
 *
 * Each allowlist entry MUST include a comment explaining WHY.
 */
const ALLOWED: string[] = [
  // This guard file contains the example patterns themselves.
  "apps/web/src/__tests__/no-inline-financial-calc.test.ts",

  // ── Platform AI-cost analytics (micros), not company financial figures ─────
  // ai-costs/route.ts and ai-dashboard/route.ts compute "% of total AI spend"
  // over internal token-cost micros (with custom one-decimal rounding), which is
  // platform usage telemetry — not a per-company financial metric. Same rationale
  // the currency guard uses to allowlist AI/platform USD pricing.
  "apps/web/src/app/api/ai-costs/route.ts",
  "apps/web/src/app/api/ai-dashboard/route.ts",
];

function isAllowed(line: string): boolean {
  return ALLOWED.some((prefix) => line.startsWith(prefix));
}

// `(… − …) / prev * 100` or `(… − …) / Math.abs(prev) * 100` — month-over-month percent done inline.
const INLINE_MOM_PERCENT =
  /-[^);]*\)\s*\/\s*(Math\.abs\([^)]+\)|[A-Za-z0-9_.]+)\s*\)?\s*\*\s*100/;

// `.reduce((s, x) => s + Number(x.amount …))` — inline money aggregation that should use dSum.
const INLINE_MONEY_REDUCE =
  /\.reduce\(\s*\([^)]*\)\s*=>\s*[A-Za-z0-9_]+\s*\+\s*Number\([^)]*\b(amount|salary|cost|revenue|mrr|burn)\b/i;

describe("no-inline-financial-calc", () => {
  it("has no inline month-over-month percent math in app source (use pctChange/ratioChange)", () => {
    const raw = execSync(
      "grep -rEn '/ *(Math.abs)?' apps/web/src --include='*.ts' --include='*.tsx' || true",
      { encoding: "utf8", cwd: REPO_ROOT, maxBuffer: 50 * 1024 * 1024 },
    );
    const offenders = raw
      .split("\n")
      .filter(Boolean)
      .filter((l) => !l.includes(".d.ts:") && !l.includes("/__tests__/"))
      .filter((l) => INLINE_MOM_PERCENT.test(l))
      .filter((l) => !isAllowed(l));
    expect(
      offenders,
      `Inline MoM percent found — use pctChange()/ratioChange():\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("has no inline Number(...amount) reduce-sums in app source (use dSum)", () => {
    const raw = execSync(
      "grep -rEn '\\.reduce\\(' apps/web/src --include='*.ts' --include='*.tsx' || true",
      { encoding: "utf8", cwd: REPO_ROOT, maxBuffer: 50 * 1024 * 1024 },
    );
    const offenders = raw
      .split("\n")
      .filter(Boolean)
      .filter((l) => !l.includes(".d.ts:") && !l.includes("/__tests__/"))
      .filter((l) => INLINE_MONEY_REDUCE.test(l))
      .filter((l) => !isAllowed(l));
    expect(
      offenders,
      `Inline money reduce-sum found — use dSum():\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
