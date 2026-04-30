import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "./setup";
import { revenueStreams } from "../schema";
import { createCompanyContext } from "./factories";

describe("revenueStreams Phase 1 schema", () => {
  it("persists startDate, endDate, and new stream types", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext({
      user: { email: "phase1-revenue-a@test.burnless.app" },
      company: { name: "Phase1 Revenue Co A" },
    });
    const start = new Date("2026-01-01");
    const end = new Date("2026-12-31");

    await db.insert(revenueStreams).values({
      companyId: ctx.company.id,
      name: "Marketplace GMV",
      type: "marketplace",
      parameters: { startingGmv: 100000, takeRate: 0.15, gmvGrowthRate: 0.05 },
      startDate: start,
      endDate: end,
    });

    const rows = await db
      .select()
      .from(revenueStreams)
      .where(eq(revenueStreams.companyId, ctx.company.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe("marketplace");
    expect(rows[0]!.startDate).toEqual(start);
    expect(rows[0]!.endDate).toEqual(end);
  });

  it("allows null endDate (open-ended stream)", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext({
      user: { email: "phase1-revenue-b@test.burnless.app" },
      company: { name: "Phase1 Revenue Co B" },
    });

    await db.insert(revenueStreams).values({
      companyId: ctx.company.id,
      name: "Open SaaS",
      type: "subscription",
      parameters: {},
      startDate: new Date("2026-01-01"),
      endDate: null,
    });

    const rows = await db
      .select()
      .from(revenueStreams)
      .where(eq(revenueStreams.companyId, ctx.company.id));
    expect(rows[0]!.endDate).toBeNull();
  });
});
