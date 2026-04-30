import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createCompanyContext,
  createDepartment,
  createHeadcountPlan,
} from "./factories";
import { getTestDb } from "./setup";
import { equityGrants, headcountPlans } from "../schema";

describe("equity_grants table", () => {
  it("inserts an ISO grant with strike price and roundtrips numeric scale", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext();
    const department = await createDepartment(ctx.company.id);
    const hire = await createHeadcountPlan(ctx.company.id, department.id);

    const [row] = await db
      .insert(equityGrants)
      .values({
        companyId: ctx.company.id,
        headcountId: hire.id,
        grantDate: new Date("2026-04-01"),
        shares: "10000.0000",
        strikePrice: "1.2345",
        grantType: "iso",
      })
      .returning();

    expect(row!.shares).toBe("10000.0000");
    expect(row!.strikePrice).toBe("1.2345");
    expect(row!.grantType).toBe("iso");
  });

  it("supports an RSU grant with embedded vestingSchedule[] in parameters JSONB", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext();
    const department = await createDepartment(ctx.company.id);
    const hire = await createHeadcountPlan(ctx.company.id, department.id);

    const vestingSchedule = [
      { date: "2027-04-01", shares: 2500 },
      { date: "2028-04-01", shares: 2500 },
      { date: "2029-04-01", shares: 2500 },
      { date: "2030-04-01", shares: 2500 },
    ];

    const [row] = await db
      .insert(equityGrants)
      .values({
        companyId: ctx.company.id,
        headcountId: hire.id,
        grantDate: new Date("2026-04-01"),
        shares: "10000.0000",
        grantType: "rsu",
        parameters: {
          cliffMonths: 12,
          vestingSchedule,
        },
      })
      .returning();

    expect(row!.grantType).toBe("rsu");
    expect(row!.strikePrice).toBeNull();

    const [readBack] = await db
      .select()
      .from(equityGrants)
      .where(eq(equityGrants.id, row!.id));
    const params = readBack!.parameters as {
      cliffMonths: number;
      vestingSchedule: Array<{ date: string; shares: number }>;
    };
    expect(params.cliffMonths).toBe(12);
    expect(params.vestingSchedule).toHaveLength(4);
    expect(params.vestingSchedule[0]).toEqual({
      date: "2027-04-01",
      shares: 2500,
    });
    expect(params.vestingSchedule[3]!.shares).toBe(2500);
  });

  it("cascades on headcount delete", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext();
    const department = await createDepartment(ctx.company.id);
    const hire = await createHeadcountPlan(ctx.company.id, department.id);
    await db.insert(equityGrants).values({
      companyId: ctx.company.id,
      headcountId: hire.id,
      grantDate: new Date("2026-05-01"),
      shares: "5000.0000",
      grantType: "nso",
    });

    await db.delete(headcountPlans).where(eq(headcountPlans.id, hire.id));

    const rows = await db
      .select()
      .from(equityGrants)
      .where(eq(equityGrants.headcountId, hire.id));
    expect(rows).toHaveLength(0);
  });
});
