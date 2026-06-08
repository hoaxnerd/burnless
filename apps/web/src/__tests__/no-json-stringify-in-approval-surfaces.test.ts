import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * ERR-03 guard — targeted source-walk over the AI write-approval / scenario-diff
 * render surfaces (AI-06, SHELL-04).
 *
 * Contract: the surfaces where a user authorizes a financial write (the AI
 * approval gate / permission card) and where a scenario promotion diff is shown
 * must NOT dump object values via JSON.stringify — that renders raw JSON blobs
 * (`{"growthRate":0.05,...}`) into the confirmation UI, overflows the diff column,
 * and reads as developer output on the highest-stakes surface.
 *
 * Fails on any JSON.stringify( inside these render files, EXCLUDING:
 *   - `body: JSON.stringify(...)` (HTTP request bodies — not display), and
 *   - `JSON.stringify(a) === / !== JSON.stringify(b)` equality comparisons.
 * Expected ~2-3 offenders (the formatVal object fallbacks + the permission-card
 * raw-actions dump). When replaced by a humanized recursive diff formatter, this
 * turns green.
 */

// __dirname = apps/web/src/__tests__  ->  WEB_ROOT = apps/web (rel paths include "src/")
const WEB_ROOT = join(__dirname, "..", "..");

/** The approval / diff render surfaces this contract governs. */
const APPROVAL_SURFACES = [
  "src/app/(dashboard)/ai/_components/generative/diff-gate.tsx",
  "src/app/(dashboard)/ai/_components/permission-card.tsx",
  "src/components/scenarios/data-diff-view.tsx",
];

/** Lines where JSON.stringify is legitimate (not a render of a value). */
function isLegitStringify(line: string): boolean {
  // HTTP request body serialization.
  if (/body:\s*JSON\.stringify/.test(line)) return true;
  // Equality comparison (dedupe / change-detection), not display.
  if (/JSON\.stringify\([^;]*\)\s*(===|!==)/.test(line)) return true;
  if (/(===|!==)\s*JSON\.stringify/.test(line)) return true;
  return false;
}

describe("no-json-stringify-in-approval-surfaces (ERR-03)", () => {
  it("AI approval/diff surfaces humanize values — no raw JSON.stringify in render paths", () => {
    // Sanity: the governed files must exist (paths drift -> fix the list, not the contract).
    const present = APPROVAL_SURFACES.filter((rel) => existsSync(join(WEB_ROOT, rel)));
    expect(present.length).toBe(APPROVAL_SURFACES.length);

    const offenders: string[] = [];
    for (const rel of APPROVAL_SURFACES) {
      const abs = join(WEB_ROOT, rel);
      const src = readFileSync(abs, "utf8");
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        if (!/JSON\.stringify\s*\(/.test(line)) return;
        if (isLegitStringify(line)) return;
        offenders.push(`${rel}:${i + 1} ${line.trim()}`);
      });
    }

    expect(
      offenders,
      `Raw JSON.stringify in AI approval/diff render surfaces (${offenders.length}) — replace with a humanized recursive diff formatter:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
