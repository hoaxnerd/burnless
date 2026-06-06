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
import { headcountPlans, bonuses, scenarioOverrides } from "../../schema";
import {
  listBonuses,
  listResolvedBonuses,
  createBonus,
  updateBonus,
  removeBonus,
} from "../bonuses";

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

describe("bonuses query module", () => {
  it("listBonuses returns base rows scoped to (companyId, headcountId)", async () => {
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
    await db.insert(bonuses).values({
      companyId: ctx.company.id,
      headcountId: hire.id,
      payoutMonth: new Date("2026-12-01"),
      amount: "5000.00",
    });
    await db.insert(bonuses).values({
      companyId: ctx.company.id,
      headcountId: otherHire!.id,
      payoutMonth: new Date("2026-12-01"),
      amount: "3000.00",
    });

    const rows = await listBonuses(ctx.company.id, hire.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe("5000.00");
  });

  it("listResolvedBonuses with null scenarioId returns same as base", async () => {
    const db = getTestDb();
    const { ctx, hire } = await setup();
    await db.insert(bonuses).values({
      companyId: ctx.company.id,
      headcountId: hire.id,
      payoutMonth: new Date("2026-12-01"),
      amount: "5000.00",
    });
    const base = await listBonuses(ctx.company.id, hire.id);
    const resolved = await listResolvedBonuses(ctx.company.id, hire.id, null);
    expect(resolved).toHaveLength(base.length);
    expect(resolved[0]!._override).toBeNull();
  });

  it("createBonus with null scenarioId writes to base table", async () => {
    const { ctx, hire } = await setup();
    await createBonus(
      {
        companyId: ctx.company.id,
        headcountId: hire.id,
        payoutMonth: new Date("2026-12-01"),
        amount: "5000.00",
      },
      null,
      ctx.company.id,
    );
    const rows = await listBonuses(ctx.company.id, hire.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe("5000.00");
  });

  it("createBonus with active scenarioId writes to scenario_overrides only", async () => {
    const db = getTestDb();
    const { ctx, hire } = await setup();
    await createBonus(
      {
        companyId: ctx.company.id,
        headcountId: hire.id,
        payoutMonth: new Date("2026-12-01"),
        amount: "5000.00",
        type: "performance",
      },
      ctx.scenario.id,
      ctx.company.id,
    );
    const baseRows = await listBonuses(ctx.company.id, hire.id);
    expect(baseRows).toHaveLength(0);

    const overrides = await db
      .select()
      .from(scenarioOverrides)
      .where(
        and(
          eq(scenarioOverrides.scenarioId, ctx.scenario.id),
          eq(scenarioOverrides.entityType, "bonus"),
        ),
      );
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.action).toBe("create");

    const resolved = await listResolvedBonuses(
      ctx.company.id,
      hire.id,
      ctx.scenario.id,
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!._override).toBe("created");
    expect((resolved[0] as any).amount).toBe("5000.00");
  });

  it("updateBonus with scenarioId creates a modify override", async () => {
    const db = getTestDb();
    const { ctx, hire } = await setup();
    const [base] = await db
      .insert(bonuses)
      .values({
        companyId: ctx.company.id,
        headcountId: hire.id,
        payoutMonth: new Date("2026-12-01"),
        amount: "5000.00",
      })
      .returning();

    await updateBonus(
      base!.id,
      { amount: "8000.00" },
      ctx.scenario.id,
      ctx.company.id,
    );

    const [stillBase] = await db
      .select()
      .from(bonuses)
      .where(eq(bonuses.id, base!.id));
    expect(stillBase!.amount).toBe("5000.00");

    const resolved = await listResolvedBonuses(
      ctx.company.id,
      hire.id,
      ctx.scenario.id,
    );
    const modified = resolved.find((r) => r.id === base!.id);
    expect(modified!._override).toBe("modified");
    expect((modified as any).amount).toBe("8000.00");
  });

  it("removeBonus with scenarioId creates a delete override", async () => {
    const db = getTestDb();
    const { ctx, hire } = await setup();
    const [base] = await db
      .insert(bonuses)
      .values({
        companyId: ctx.company.id,
        headcountId: hire.id,
        payoutMonth: new Date("2026-12-01"),
        amount: "5000.00",
      })
      .returning();

    await removeBonus(base!.id, ctx.scenario.id, ctx.company.id);

    const stillBase = await db
      .select()
      .from(bonuses)
      .where(eq(bonuses.id, base!.id));
    expect(stillBase).toHaveLength(1);

    const resolved = await listResolvedBonuses(
      ctx.company.id,
      hire.id,
      ctx.scenario.id,
    );
    expect(resolved.find((r) => r.id === base!.id)).toBeUndefined();
  });
});
