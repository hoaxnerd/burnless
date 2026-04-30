import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  createCompanyContext,
  createDepartment,
  createHeadcountPlan,
} from "./factories";
import { getTestDb } from "./setup";
import { salaryChanges } from "../schema";

describe("salary_changes table", () => {
  it("inserts and reads back a salary change row", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext();
    const department = await createDepartment(ctx.company.id);
    const hire = await createHeadcountPlan(ctx.company.id, department.id, {
      title: "Engineer",
      salary: "100000.00",
    });

    const [row] = await db
      .insert(salaryChanges)
      .values({
        companyId: ctx.company.id,
        headcountId: hire.id,
        effectiveDate: new Date("2026-07-01"),
        newSalary: "115000.00",
        reason: "annual review",
      })
      .returning();

    expect(row!.headcountId).toBe(hire.id);
    expect(row!.newSalary).toBe("115000.00");
    expect(row!.reason).toBe("annual review");
    expect(row!.effectiveDate).toEqual(new Date("2026-07-01"));
  });

  it("supports multiple salary changes per hire and queries them by date", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext();
    const department = await createDepartment(ctx.company.id);
    const hire = await createHeadcountPlan(ctx.company.id, department.id, {
      title: "Lead",
      salary: "130000.00",
    });

    await db.insert(salaryChanges).values([
      {
        companyId: ctx.company.id,
        headcountId: hire.id,
        effectiveDate: new Date("2026-01-01"),
        newSalary: "135000.00",
      },
      {
        companyId: ctx.company.id,
        headcountId: hire.id,
        effectiveDate: new Date("2026-07-01"),
        newSalary: "150000.00",
      },
    ]);

    const rows = await db
      .select()
      .from(salaryChanges)
      .where(
        and(
          eq(salaryChanges.companyId, ctx.company.id),
          eq(salaryChanges.headcountId, hire.id)
        )
      );
    expect(rows).toHaveLength(2);
    const salaries = rows.map((r) => r.newSalary).sort();
    expect(salaries).toEqual(["135000.00", "150000.00"]);
  });

  it("cascades on headcount delete", async () => {
    const db = getTestDb();
    const { headcountPlans } = await import("../schema");
    const ctx = await createCompanyContext();
    const department = await createDepartment(ctx.company.id);
    const hire = await createHeadcountPlan(ctx.company.id, department.id, {
      title: "Doomed Role",
      salary: "90000.00",
    });
    await db.insert(salaryChanges).values({
      companyId: ctx.company.id,
      headcountId: hire.id,
      effectiveDate: new Date("2026-03-01"),
      newSalary: "95000.00",
    });

    await db.delete(headcountPlans).where(eq(headcountPlans.id, hire.id));

    const rows = await db
      .select()
      .from(salaryChanges)
      .where(eq(salaryChanges.headcountId, hire.id));
    expect(rows).toHaveLength(0);
  });
});
