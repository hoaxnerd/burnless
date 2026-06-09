/**
 * Guard: the "forecast-lines" mutation source must invalidate the EXPENSE
 * insight (it was previously omitted, so expense edits never refreshed the
 * /expenses AI insight). We assert via the public invalidateInsights() behavior
 * — it inserts one row per affected insight type.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockValues, mockOnConflictDoUpdate, mockInsert } = vi.hoisted(() => {
  const onConflict = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflict });
  const insert = vi.fn().mockReturnValue({ values });
  return { mockValues: values, mockOnConflictDoUpdate: onConflict, mockInsert: insert };
});

vi.mock("@burnless/db", () => ({
  db: { insert: mockInsert },
  insightInvalidations: { companyId: "companyId", insightType: "insightType" },
}));
vi.mock("../logger", () => ({ logger: () => ({ debug: vi.fn(), warn: vi.fn() }) }));
vi.mock("../insight-staleness", () => ({ markInsightsStale: vi.fn().mockResolvedValue(undefined) }));

import { invalidateInsights } from "../insight-invalidation";

beforeEach(() => vi.clearAllMocks());

describe("INVALIDATION_MAP forecast-lines", () => {
  it("invalidates the expense insight (among others) for forecast-lines mutations", async () => {
    await invalidateInsights("c1", "forecast-lines");
    const insertedTypes = mockValues.mock.calls.map((c) => (c[0] as { insightType: string }).insightType);
    expect(insertedTypes).toContain("expense");
    // Existing set preserved.
    expect(insertedTypes).toContain("revenue");
    expect(insertedTypes).toContain("dashboard");
    expect(insertedTypes).toContain("scenario");
    expect(insertedTypes).toContain("reports");
  });
});
