import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createCompanyContext, createDepartment } from "./factories";
import { getTestDb } from "./setup";
import { headcountPlans, companies } from "../schema";

describe("headcountPlans Phase 1 schema", () => {
  it("persists name + employeeType + hoursPerWeek + 0.50 FTE count", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext();
    const department = await createDepartment(ctx.company.id);
    const [hire] = await db
      .insert(headcountPlans)
      .values({
        companyId: ctx.company.id,
        departmentId: department.id,
        title: "Senior Engineer",
        name: "Alice Smith",
        employeeType: "part_time",
        count: "0.50",
        salary: "120000.00",
        hoursPerWeek: "20.00",
        startDate: new Date("2026-04-01"),
      })
      .returning();
    expect(hire!.name).toBe("Alice Smith");
    expect(hire!.employeeType).toBe("part_time");
    expect(hire!.count).toBe("0.50");
    expect(hire!.hoursPerWeek).toBe("20.00");
  });

  it("persists benefitsRates JSONB on companies", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext();
    await db
      .update(companies)
      .set({
        benefitsRates: {
          statutoryEmployerContributionsCost: 0.0765,
          insuranceBenefitsCost: 0.05,
          retirementContributionsCost: 0.04,
          otherBenefitsCost: 0.01,
        },
      })
      .where(eq(companies.id, ctx.company.id));
    const [row] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, ctx.company.id));
    expect((row!.benefitsRates as any).insuranceBenefitsCost).toBeCloseTo(
      0.05,
      4
    );
  });
});
