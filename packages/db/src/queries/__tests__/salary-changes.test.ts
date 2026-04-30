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
import { headcountPlans, salaryChanges, scenarioOverrides } from "../../schema";
import {
  listSalaryChanges,
  listResolvedSalaryChanges,
  createSalaryChange,
  updateSalaryChange,
  removeSalaryChange,
} from "../salary-changes";

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

describe("salary-changes query module", () => {
  it("listSalaryChanges returns base rows scoped to (companyId, headcountId)", async () => {
    const db = getTestDb();
    const { ctx, hire } = await setup();
    // Second hire — should not appear
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

    await db.insert(salaryChanges).values({
      companyId: ctx.company.id,
      headcountId: hire.id,
      effectiveDate: new Date("2026-06-01"),
      newSalary: "150000.00",
    });
    await db.insert(salaryChanges).values({
      companyId: ctx.company.id,
      headcountId: otherHire!.id,
      effectiveDate: new Date("2026-06-01"),
      newSalary: "110000.00",
    });

    const rows = await listSalaryChanges(ctx.company.id, hire.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.newSalary).toBe("150000.00");
  });

  it("listResolvedSalaryChanges with null scenarioId returns same as base", async () => {
    const db = getTestDb();
    const { ctx, hire } = await setup();
    await db.insert(salaryChanges).values({
      companyId: ctx.company.id,
      headcountId: hire.id,
      effectiveDate: new Date("2026-06-01"),
      newSalary: "150000.00",
    });

    const base = await listSalaryChanges(ctx.company.id, hire.id);
    const resolved = await listResolvedSalaryChanges(
      ctx.company.id,
      hire.id,
      null,
    );
    expect(resolved).toHaveLength(base.length);
    expect(resolved[0]!._override).toBeNull();
  });

  it("createSalaryChange with null scenarioId writes to base table", async () => {
    const { ctx, hire } = await setup();
    await createSalaryChange(
      {
        companyId: ctx.company.id,
        headcountId: hire.id,
        effectiveDate: new Date("2026-06-01"),
        newSalary: "150000.00",
      },
      null,
    );
    const rows = await listSalaryChanges(ctx.company.id, hire.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.newSalary).toBe("150000.00");
  });

  it("createSalaryChange with active scenarioId writes to scenario_overrides only", async () => {
    const db = getTestDb();
    const { ctx, hire } = await setup();
    const result = await createSalaryChange(
      {
        companyId: ctx.company.id,
        headcountId: hire.id,
        effectiveDate: new Date("2026-06-01"),
        newSalary: "150000.00",
      },
      ctx.scenario.id,
    );
    // Base table empty
    const baseRows = await listSalaryChanges(ctx.company.id, hire.id);
    expect(baseRows).toHaveLength(0);

    // Override exists
    const overrides = await db
      .select()
      .from(scenarioOverrides)
      .where(
        and(
          eq(scenarioOverrides.scenarioId, ctx.scenario.id),
          eq(scenarioOverrides.entityType, "salary_change"),
        ),
      );
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.action).toBe("create");

    // Resolved view sees it
    const resolved = await listResolvedSalaryChanges(
      ctx.company.id,
      hire.id,
      ctx.scenario.id,
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!._override).toBe("created");
    expect((resolved[0] as any).newSalary).toBe("150000.00");
    expect((result as any).id).toBeDefined();
  });

  it("updateSalaryChange with scenarioId creates a modify override", async () => {
    const db = getTestDb();
    const { ctx, hire } = await setup();
    const [base] = await db
      .insert(salaryChanges)
      .values({
        companyId: ctx.company.id,
        headcountId: hire.id,
        effectiveDate: new Date("2026-06-01"),
        newSalary: "130000.00",
      })
      .returning();

    await updateSalaryChange(
      base!.id,
      { newSalary: "200000.00" },
      ctx.scenario.id,
    );

    // Base unchanged
    const [stillBase] = await db
      .select()
      .from(salaryChanges)
      .where(eq(salaryChanges.id, base!.id));
    expect(stillBase!.newSalary).toBe("130000.00");

    // Resolved reflects change
    const resolved = await listResolvedSalaryChanges(
      ctx.company.id,
      hire.id,
      ctx.scenario.id,
    );
    const modified = resolved.find((r) => r.id === base!.id);
    expect(modified!._override).toBe("modified");
    expect((modified as any).newSalary).toBe("200000.00");
  });

  it("removeSalaryChange with scenarioId creates a delete override", async () => {
    const db = getTestDb();
    const { ctx, hire } = await setup();
    const [base] = await db
      .insert(salaryChanges)
      .values({
        companyId: ctx.company.id,
        headcountId: hire.id,
        effectiveDate: new Date("2026-06-01"),
        newSalary: "130000.00",
      })
      .returning();

    await removeSalaryChange(base!.id, ctx.scenario.id);

    // Base still there
    const stillBase = await db
      .select()
      .from(salaryChanges)
      .where(eq(salaryChanges.id, base!.id));
    expect(stillBase).toHaveLength(1);

    // Resolved view excludes it
    const resolved = await listResolvedSalaryChanges(
      ctx.company.id,
      hire.id,
      ctx.scenario.id,
    );
    expect(resolved.find((r) => r.id === base!.id)).toBeUndefined();
  });
});
