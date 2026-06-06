import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { getTestDb } from "../../__tests__/setup";

vi.mock("../../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import {
  createCompanyContext,
  createDepartment,
} from "../../__tests__/factories";
import { headcountPlans, equityGrants, scenarioOverrides } from "../../schema";
import {
  listEquityGrants,
  listResolvedEquityGrants,
  createEquityGrant,
  updateEquityGrant,
  removeEquityGrant,
} from "../equity-grants";

async function setup() {
  const db = getTestDb();
  const ctx = await createCompanyContext();
  const dept = await createDepartment(ctx.company.id);
  const [hire] = await db
    .insert(headcountPlans)
    .values({
      companyId: ctx.company.id,
      departmentId: dept.id,
      title: "Eng",
      salary: "120000.00",
      startDate: new Date("2026-01-01"),
    })
    .returning();
  return { ctx, hire: hire! };
}

describe("equity-grants query module", () => {
  it("listEquityGrants returns base rows scoped to (companyId, headcountId)", async () => {
    const db = getTestDb();
    const { ctx, hire } = await setup();
    const dept = await createDepartment(ctx.company.id);
    const [otherHire] = await db
      .insert(headcountPlans)
      .values({
        companyId: ctx.company.id,
        departmentId: dept.id,
        title: "PM",
        salary: "100000.00",
        startDate: new Date("2026-01-01"),
      })
      .returning();
    await db.insert(equityGrants).values({
      companyId: ctx.company.id,
      headcountId: hire.id,
      grantDate: new Date("2026-06-01"),
      shares: "10000.0000",
    });
    await db.insert(equityGrants).values({
      companyId: ctx.company.id,
      headcountId: otherHire!.id,
      grantDate: new Date("2026-06-01"),
      shares: "5000.0000",
    });

    const rows = await listEquityGrants(ctx.company.id, hire.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.shares).toBe("10000.0000");
  });

  it("listResolvedEquityGrants with null scenarioId returns same as base", async () => {
    const db = getTestDb();
    const { ctx, hire } = await setup();
    await db.insert(equityGrants).values({
      companyId: ctx.company.id,
      headcountId: hire.id,
      grantDate: new Date("2026-06-01"),
      shares: "10000.0000",
    });
    const base = await listEquityGrants(ctx.company.id, hire.id);
    const resolved = await listResolvedEquityGrants(
      ctx.company.id,
      hire.id,
      null,
    );
    expect(resolved).toHaveLength(base.length);
    expect(resolved[0]!._override).toBeNull();
  });

  it("createEquityGrant with null scenarioId writes to base table", async () => {
    const { ctx, hire } = await setup();
    await createEquityGrant(
      {
        companyId: ctx.company.id,
        headcountId: hire.id,
        grantDate: new Date("2026-06-01"),
        shares: "10000.0000",
        parameters: { vestingSchedule: [], cliffMonths: 12 },
      },
      null,
      ctx.company.id,
    );
    const rows = await listEquityGrants(ctx.company.id, hire.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.shares).toBe("10000.0000");
    expect((rows[0]!.parameters as any).cliffMonths).toBe(12);
  });

  it("createEquityGrant with active scenarioId writes to scenario_overrides only", async () => {
    const db = getTestDb();
    const { ctx, hire } = await setup();
    await createEquityGrant(
      {
        companyId: ctx.company.id,
        headcountId: hire.id,
        grantDate: new Date("2026-06-01"),
        shares: "10000.0000",
        strikePrice: "1.00",
        grantType: "iso",
        parameters: {
          vestingSchedule: [
            { date: "2026-06-01", percentage: 0.25 },
            { date: "2027-06-01", percentage: 0.25 },
          ],
          cliffMonths: 12,
        },
      },
      ctx.scenario.id,
      ctx.company.id,
    );
    const baseRows = await listEquityGrants(ctx.company.id, hire.id);
    expect(baseRows).toHaveLength(0);

    const overrides = await db
      .select()
      .from(scenarioOverrides)
      .where(
        and(
          eq(scenarioOverrides.scenarioId, ctx.scenario.id),
          eq(scenarioOverrides.entityType, "equity_grant"),
        ),
      );
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.action).toBe("create");

    const resolved = await listResolvedEquityGrants(
      ctx.company.id,
      hire.id,
      ctx.scenario.id,
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!._override).toBe("created");
    expect((resolved[0] as any).shares).toBe("10000.0000");
    expect((resolved[0] as any).parameters.vestingSchedule).toHaveLength(2);
  });

  it("updateEquityGrant with scenarioId creates a modify override", async () => {
    const db = getTestDb();
    const { ctx, hire } = await setup();
    const [base] = await db
      .insert(equityGrants)
      .values({
        companyId: ctx.company.id,
        headcountId: hire.id,
        grantDate: new Date("2026-06-01"),
        shares: "10000.0000",
      })
      .returning();

    await updateEquityGrant(
      base!.id,
      { shares: "20000.0000" },
      ctx.scenario.id,
      ctx.company.id,
    );

    const [stillBase] = await db
      .select()
      .from(equityGrants)
      .where(eq(equityGrants.id, base!.id));
    expect(stillBase!.shares).toBe("10000.0000");

    const resolved = await listResolvedEquityGrants(
      ctx.company.id,
      hire.id,
      ctx.scenario.id,
    );
    const modified = resolved.find((r) => r.id === base!.id);
    expect(modified!._override).toBe("modified");
    expect((modified as any).shares).toBe("20000.0000");
  });

  it("removeEquityGrant with scenarioId creates a delete override", async () => {
    const db = getTestDb();
    const { ctx, hire } = await setup();
    const [base] = await db
      .insert(equityGrants)
      .values({
        companyId: ctx.company.id,
        headcountId: hire.id,
        grantDate: new Date("2026-06-01"),
        shares: "10000.0000",
      })
      .returning();

    await removeEquityGrant(base!.id, ctx.scenario.id, ctx.company.id);

    const stillBase = await db
      .select()
      .from(equityGrants)
      .where(eq(equityGrants.id, base!.id));
    expect(stillBase).toHaveLength(1);

    const resolved = await listResolvedEquityGrants(
      ctx.company.id,
      hire.id,
      ctx.scenario.id,
    );
    expect(resolved.find((r) => r.id === base!.id)).toBeUndefined();
  });
});
