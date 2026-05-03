import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createCompanyContext,
  createDepartment,
  createHeadcountPlan,
} from "./factories";
import { getTestDb } from "./setup";
import { bonuses, headcountPlans } from "../schema";

describe("bonuses table", () => {
  it("inserts and reads back a bonus row with default type", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext();
    const department = await createDepartment(ctx.company.id);
    const hire = await createHeadcountPlan(ctx.company.id, department.id);

    const [row] = await db
      .insert(bonuses)
      .values({
        companyId: ctx.company.id,
        headcountId: hire.id,
        payoutMonth: new Date("2026-12-01"),
        amount: "5000.00",
        notes: "End-of-year",
      })
      .returning();

    expect(row!.amount).toBe("5000.00");
    expect(row!.type).toBe("performance");
    expect(row!.notes).toBe("End-of-year");
  });

  it("supports each bonus_type enum value", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext();
    const department = await createDepartment(ctx.company.id);
    const hire = await createHeadcountPlan(ctx.company.id, department.id);

    const types = ["signing", "performance", "retention", "other"] as const;
    for (const type of types) {
      await db.insert(bonuses).values({
        companyId: ctx.company.id,
        headcountId: hire.id,
        payoutMonth: new Date("2026-06-01"),
        amount: "1000.00",
        type,
      });
    }

    const rows = await db
      .select()
      .from(bonuses)
      .where(eq(bonuses.headcountId, hire.id));
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.type).sort()).toEqual([
      "other",
      "performance",
      "retention",
      "signing",
    ]);
  });

  it("cascades on headcount delete", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext();
    const department = await createDepartment(ctx.company.id);
    const hire = await createHeadcountPlan(ctx.company.id, department.id);
    await db.insert(bonuses).values({
      companyId: ctx.company.id,
      headcountId: hire.id,
      payoutMonth: new Date("2026-09-01"),
      amount: "2500.00",
      type: "signing",
    });

    await db.delete(headcountPlans).where(eq(headcountPlans.id, hire.id));

    const rows = await db
      .select()
      .from(bonuses)
      .where(eq(bonuses.headcountId, hire.id));
    expect(rows).toHaveLength(0);
  });
});
