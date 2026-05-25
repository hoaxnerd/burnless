// apps/web/src/__tests__/no-raw-form-inputs.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// __dirname = apps/web/src/__tests__
const ROOT = join(__dirname, "..", "app/(dashboard)");

const TARGET_DIRS = [
  "expenses/forecast-method-fields",
  "team/employee-type-fields",
  "funding/round-fields",
];

const TARGET_FILES = [
  "team/salary-changes-list.tsx",
  "team/bonuses-list.tsx",
  "team/equity-grants-list.tsx",
  "team/vesting-schedule-editor.tsx",
  "team/benefits-breakdown-editor.tsx",
  "team/headcount-form.tsx",
  "funding/funding-details.tsx",
  "funding/investor-list.tsx",
  "funding/milestone-tracker.tsx",
];

const FORBIDDEN = [
  /<input\s+[^>]*type=["']number["']/,
  /<input\s+[^>]*type=["']date["']/,
];

// Files that are intentionally exempt. Keep this list small + justified.
const ALLOWLIST = new Set<string>([
  // (empty for now — Tasks 2-4 left zero offenders)
]);

function listTsxFiles(dir: string): string[] {
  const acc: string[] = [];
  try {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      const st = statSync(full);
      if (st.isDirectory()) acc.push(...listTsxFiles(full));
      else if (e.endsWith(".tsx") && !e.endsWith(".test.tsx")) acc.push(full);
    }
  } catch {
    // Directory doesn't exist — return empty array (test will surface if a path is wrong)
  }
  return acc;
}

describe("no raw form inputs in promoted form areas (Phase 4 D)", () => {
  const filesToScan = [
    ...TARGET_DIRS.flatMap((d) => listTsxFiles(join(ROOT, d))),
    ...TARGET_FILES.map((f) => join(ROOT, f)),
  ].filter((p) => !ALLOWLIST.has(p));

  it("scan list is non-empty (sanity)", () => {
    // Catch a misconfiguration where all paths resolved to nothing.
    expect(filesToScan.length).toBeGreaterThan(5);
  });

  it.each(filesToScan)("%s contains no raw number/date inputs", (path) => {
    const src = readFileSync(path, "utf8");
    const offenders: string[] = [];
    for (const rx of FORBIDDEN) {
      const m = src.match(rx);
      if (m) offenders.push(m[0]);
    }
    expect(offenders).toEqual([]);
  });
});
