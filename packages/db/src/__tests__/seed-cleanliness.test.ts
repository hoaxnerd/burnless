// packages/db/src/__tests__/seed-cleanliness.test.ts
// Phase 4 B Task 7 — Guards that seed output never carries scenario-leak markers.
// Locks in the Task 6 cleanup: any future promotion of E2E-suffixed names into
// the base seed tables will fail CI immediately.
import { describe, it, expect, beforeAll } from "vitest";
import { getTestDb } from "./setup";
import { seedTestAccounts } from "../seed-test-accounts";
import { revenueStreams, headcountPlans, fundingRounds } from "../schema";

// Every pattern below matches a known real-world leak that was observed in
// the test-pro account or during E2E runs:
//   - MODIFIED/DELETED/CREATED IN SCENARIO — suffixes appended by the
//     scenario-promotion path before Task 6 cleaned it up.
//   - SMOKE- — E2E comprehensive-crud spec creates names like "Smoke-Ecommerce";
//     these must never land in the base seed.  No seed string starts with
//     "Smoke-" intentionally (confirmed by reading seed-test-accounts.ts).
//   - E2E[ -] — generic E2E-run prefix that should never appear in canonical data.
//   - DEBUG / TODO — development leftovers that indicate an unintentional commit.
const POLLUTION_MARKERS = [
  /\(MODIFIED IN SCENARIO\)/i,
  /\(DELETED IN SCENARIO\)/i,
  /\(CREATED IN SCENARIO\)/i,
  /\bSMOKE-/i,
  /\bE2E[\s-]/i,
  /\bDEBUG\b/i,
  /\bTODO\b/i,
];

describe("seed cleanliness (Phase 4 B Task 7)", () => {
  beforeAll(async () => {
    // setup.ts (imported above) has already registered a beforeAll that
    // initialises PGLite and runs migrations.  We just run the seed against
    // that same in-memory DB here.
    const db = getTestDb();
    await seedTestAccounts(db);
  });

  it("no base revenue_stream name contains scenario-leak markers", async () => {
    const db = getTestDb();
    const rows = await db.select({ name: revenueStreams.name }).from(revenueStreams);
    const polluted = rows.filter((r) =>
      POLLUTION_MARKERS.some((rx) => rx.test(r.name ?? "")),
    );
    expect(polluted).toEqual([]);
  });

  it("no base headcount_plan title contains scenario-leak markers", async () => {
    const db = getTestDb();
    const rows = await db.select({ title: headcountPlans.title }).from(headcountPlans);
    const polluted = rows.filter((r) =>
      POLLUTION_MARKERS.some((rx) => rx.test(r.title ?? "")),
    );
    expect(polluted).toEqual([]);
  });

  it("no base funding_round name contains scenario-leak markers", async () => {
    const db = getTestDb();
    const rows = await db.select({ name: fundingRounds.name }).from(fundingRounds);
    const polluted = rows.filter((r) =>
      POLLUTION_MARKERS.some((rx) => rx.test(r.name ?? "")),
    );
    expect(polluted).toEqual([]);
  });
});
