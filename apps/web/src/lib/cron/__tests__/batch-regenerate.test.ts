// apps/web/src/lib/cron/__tests__/batch-regenerate.test.ts
import { describe, it, expect, vi } from "vitest";

// The real query is db.select().from().where() and awaits the where() result as
// the pending array (no .orderBy), so where() must resolve to [].
vi.mock("@burnless/db", () => ({
  db: { select: () => ({ from: () => ({ where: async () => [] }) }) },
  insightInvalidations: {}, aiInsightCache: {},
}));
vi.mock("@burnless/ai", () => ({ generatePageInsights: vi.fn() }));
vi.mock("@/lib/build-ai-context", () => ({ buildAiContext: vi.fn() }));
vi.mock("@/lib/ai-feature-flags", () => ({ checkAiFeatureAllowed: vi.fn(), getCompanyProviderConfig: vi.fn() }));
vi.mock("@/lib/ai-usage-tracker", () => ({ setTrackingCompanyId: vi.fn() }));
vi.mock("@/lib/data", () => ({ getDefaultScenario: vi.fn() }));

import { runBatchRegenerate } from "../batch-regenerate";

describe("runBatchRegenerate", () => {
  it("returns an envelope with no work when no invalidations are pending", async () => {
    const r = await runBatchRegenerate();
    expect(r.ok).toBe(true);
    expect(r.processed).toBe(0);
  });
});
