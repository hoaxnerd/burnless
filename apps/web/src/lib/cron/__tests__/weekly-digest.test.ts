// apps/web/src/lib/cron/__tests__/weekly-digest.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@burnless/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }), orderBy: () => ({ limit: async () => [] }) }) }) },
  companies: {}, users: {}, weeklyDigests: {},
}));
// runWeeklyDigest transitively imports ai-feature-flags -> api-helpers -> next-auth,
// which fails to resolve under happy-dom. Stub the direct deps so the module loads;
// none are reached for an empty company batch.
vi.mock("@/lib/ai-feature-flags", () => ({ getAiFlags: vi.fn() }));
vi.mock("@/lib/compute-digest", () => ({ computeWeeklyDigest: vi.fn(), buildDeterministicSummary: vi.fn() }));
vi.mock("@/lib/digest-narrative", () => ({ generateDigestNarrative: vi.fn() }));
vi.mock("@/lib/email", () => ({ email: { provider: { send: vi.fn() } } }));
vi.mock("@/lib/email/templates", () => ({ weeklyDigestEmail: vi.fn() }));
vi.mock("@/lib/server-currency", () => ({ companyCurrency: vi.fn() }));

import { runWeeklyDigest } from "../weekly-digest";

describe("runWeeklyDigest", () => {
  it("returns a summary envelope with zero companies when none exist", async () => {
    const r = await runWeeklyDigest();
    expect(r.total).toBe(0);
    expect(r.generated).toBe(0);
    expect(Array.isArray(r.results)).toBe(true);
  });
});
