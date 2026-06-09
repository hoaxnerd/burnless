import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Resolve repo root: vitest runs from apps/web/, so go up two levels.
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../");

/**
 * FMT-3 guard (systemic-issues.json#FMT-3; QA finding RPT-02).
 *
 * The board-update report renders GROSS burn (`metrics.burnRate` = expenses +
 * interest, per CLAUDE.md Phase 5) under a label that reads "Net Burn" /
 * "Net Burn Rate". Net burn is a distinct registry metric
 * (`netBurnRate = max(0, gross - revenue)`); gross != net whenever revenue > 0,
 * so this is a material misstatement on a board-facing report.
 *
 * Concretely (current buggy code):
 *   - board-update/page.tsx: the "Net Burn" KPI card value = formatCurrency(burnRate)
 *     (gross) while its sparkData uses metrics.netBurnRate — value/spark mismatch.
 *   - board-update-view.tsx: 'Net burn rate: ' + c.burnRate, and a 'Net Burn Rate'
 *     KPI bound to d.cash.burnRate.
 *
 * This guard pins the FIXED contract: a value/sparkline shown under a Net-Burn
 * label must reference the NET series (`netBurnRate`), never the gross
 * `burnRate`. RED now (the value expressions currently read gross `burnRate`).
 *
 * Implementation: read each source file, locate every line/region carrying a
 * "Net Burn" label string, and assert the associated value expression does NOT
 * bind the GROSS `burnRate` token. "Gross `burnRate`" = the identifier
 * `burnRate` NOT immediately preceded by `net`/`Net` (which would make it the
 * legitimate `netBurnRate`).
 */

const BOARD_UPDATE_PAGE = path.join(
  REPO_ROOT,
  "apps/web/src/app/(dashboard)/reports/board-update/page.tsx"
);
const BOARD_UPDATE_VIEW = path.join(
  REPO_ROOT,
  "apps/web/src/app/(dashboard)/reports/board-update/board-update-view.tsx"
);

/** Matches the gross `burnRate` identifier (not `netBurnRate`). */
const GROSS_BURN = /(?<![A-Za-z])(?<!net)(?<!Net)burnRate\b/;

describe("net-burn-label-uses-net-series (FMT-3)", () => {
  it("board-update/page.tsx: the 'Net Burn' KPI value binds netBurnRate, not gross burnRate", () => {
    const src = readFileSync(BOARD_UPDATE_PAGE, "utf8");
    const lines = src.split("\n");

    // Find the KPI card object literal carrying label: "Net Burn".
    const labelIdx = lines.findIndex((l) => /label:\s*"Net Burn"/.test(l));
    expect(
      labelIdx,
      `Expected a 'Net Burn' KPI card in board-update/page.tsx`
    ).toBeGreaterThanOrEqual(0);

    // The `value:` line is the one immediately following the label inside the
    // same card object (scan a small window).
    const window = lines.slice(labelIdx, labelIdx + 4);
    const valueLine = window.find((l) => /\bvalue:/.test(l)) ?? "";

    const offenders: string[] = [];
    if (GROSS_BURN.test(valueLine)) {
      offenders.push(
        `${path.relative(REPO_ROOT, BOARD_UPDATE_PAGE)}:${labelIdx + 1 + window.indexOf(valueLine)}: ` +
          `'Net Burn' card value binds gross burnRate -> ${valueLine.trim()}`
      );
    }

    expect(
      offenders,
      `'Net Burn' card must show the net series (netBurnRate):\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("board-update-view.tsx: no 'Net burn' label is bound to gross burnRate", () => {
    const src = readFileSync(BOARD_UPDATE_VIEW, "utf8");
    const lines = src.split("\n");

    const offenders: string[] = [];

    lines.forEach((line, i) => {
      // (1) Narrative line: `Net burn rate: ${...c.burnRate...}`
      if (/Net burn rate:/i.test(line) && GROSS_BURN.test(line)) {
        offenders.push(
          `${path.relative(REPO_ROOT, BOARD_UPDATE_VIEW)}:${i + 1}: narrative binds gross burnRate -> ${line.trim()}`
        );
      }
      // (2) KPI label "Net Burn Rate" — the value sits on the following line(s).
      if (/Net Burn Rate/i.test(line)) {
        const region = lines.slice(i, i + 3).join("\n");
        if (GROSS_BURN.test(region)) {
          offenders.push(
            `${path.relative(REPO_ROOT, BOARD_UPDATE_VIEW)}:${i + 1}: 'Net Burn Rate' KPI binds gross burnRate -> ${region.trim().replace(/\n/g, " ")}`
          );
        }
      }
    });

    expect(
      offenders,
      `'Net Burn Rate' surfaces must show the net series (netBurnRate):\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
