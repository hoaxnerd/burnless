import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

// Resolve repo root: vitest runs from apps/web/, so go up two levels.
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../");

/**
 * WILD-02 guard (QA findings TEAM-02, TEAM-03, TEAM-07, TEAM-09).
 *
 * team-details.tsx hand-rolls per-member / per-hire MONTHLY people cost inline as
 *   (salary * count * (1 + benefitsRate)) / 12
 * in five places (member row, hiringTimeline reduce, Total Hiring Impact reduce,
 * per-hire impact, HiringInsightTip reduce).
 *
 * That inline formula is WRONG and divergent from the engine:
 *   - it ignores employeeType — a part_time hire is not prorated by
 *     hoursPerWeek/40, and a contractor (salary forced to 0 by
 *     normalizeHeadcountPayload) is mis-costed (TEAM-02);
 *   - it bakes in the legacy flat benefitsRate instead of the per-slot
 *     benefits breakdown the engine uses (TEAM-03 / TEAM-09);
 *   - it never routes the result through the shared currency formatter (TEAM-07).
 *
 * The single source of truth for monthly personnel cost is the engine
 * (`packages/engine/src/headcount.ts` — effectiveMonthlyCost, employeeType-aware,
 * cumulative-rounding). The team UI must consume the engine cost, never
 * re-derive it inline.
 *
 * This walker scans the WHOLE team tree (IRON RULE 1 — catch the idiom anywhere
 * it appears, not just team-details.tsx) and fails any inline
 * `* (1 + <...>) / 12` monthly people-cost idiom.
 *
 * Allowlist: test files / fixtures and this guard file.
 */
const TEAM_DIR = "apps/web/src/app/(dashboard)/team";

const ALLOWED = [
  // This guard file (contains the idiom in its regex/comment).
  "apps/web/src/__tests__/no-inline-people-cost.test.ts",
  // Test files & fixtures.
  "apps/web/src/__tests__/",
];

function isAllowed(line: string): boolean {
  return ALLOWED.some((prefix) => line.startsWith(prefix));
}

function isTestFile(line: string): boolean {
  const file = line.split(":")[0];
  return file.includes("/__tests__/") || /\.test\.(ts|tsx)$/.test(file);
}

describe("no-inline-people-cost (WILD-02)", () => {
  it("computes no monthly people cost inline as `* (1 + <rate>) / 12` in the team UI", () => {
    // The monthly people-cost idiom: a multiplication into `(1 + <rate>)`
    // (the benefits gross-up) divided by 12 (annual->monthly). Requires the
    // leading `*` so a bare `(1 + x) / 12` elsewhere is not mistaken for it.
    const pattern = "\\* .*\\(1 \\+ .*\\) ?/ ?12";
    const raw = execSync(
      `grep -rEn '${pattern}' '${REPO_ROOT}/${TEAM_DIR}' --include='*.ts' --include='*.tsx' || true`,
      { encoding: "utf8", cwd: REPO_ROOT, maxBuffer: 50 * 1024 * 1024 }
    );

    const offenders = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => line.replace(`${REPO_ROOT}/`, ""))
      .filter((line) => !line.includes(".d.ts:"))
      .filter((line) => !isTestFile(line))
      .filter((line) => !isAllowed(line));

    expect(
      offenders,
      `Inline monthly people-cost formulas found (consume the engine headcount cost instead):\n` +
        `${offenders.length} offenders:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
