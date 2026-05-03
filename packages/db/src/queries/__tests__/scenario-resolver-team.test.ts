import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../__tests__/setup";

// Redirect query-module `db` import to the PGLite test instance.
vi.mock("../../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import { resolveEntities } from "../scenario-resolver";
import { upsertOverride } from "../scenario-overrides";
import {
  createCompanyContext,
  createDepartment,
} from "../../__tests__/factories";
import {
  salaryChanges,
  bonuses,
  equityGrants,
  headcountPlans,
} from "../../schema";

describe("scenario resolver: new team entity types", () => {
  describe("salary_change", () => {
    it("'create' override appears in resolved set tagged 'created'", async () => {
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

      const newId = "sc-create-1";
      await upsertOverride(
        ctx.scenario.id,
        "salary_change",
        newId,
        "create",
        {
          id: newId,
          companyId: ctx.company.id,
          headcountId: hire!.id,
          effectiveDate: new Date("2026-06-01").toISOString(),
          newSalary: "150000.00",
        },
        null,
      );

      const baseRows = await db
        .select()
        .from(salaryChanges)
        .where(eq(salaryChanges.companyId, ctx.company.id));
      const resolved = await resolveEntities(
        "salary_change",
        baseRows,
        ctx.scenario.id,
      );
      const created = resolved.find(
        (r) => (r as any)._override === "created",
      );
      expect(created).toBeDefined();
      expect((created as any).newSalary).toBe("150000.00");
    });

    it("'modify' override replaces a base row's data", async () => {
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
      const [base] = await db
        .insert(salaryChanges)
        .values({
          companyId: ctx.company.id,
          headcountId: hire!.id,
          effectiveDate: new Date("2026-06-01"),
          newSalary: "130000.00",
          reason: "annual",
        })
        .returning();

      await upsertOverride(
        ctx.scenario.id,
        "salary_change",
        base!.id,
        "modify",
        {
          ...base!,
          newSalary: "200000.00",
          effectiveDate: new Date("2026-06-01").toISOString(),
        },
        base as unknown as Record<string, unknown>,
      );

      const baseRows = await db
        .select()
        .from(salaryChanges)
        .where(eq(salaryChanges.companyId, ctx.company.id));
      const resolved = await resolveEntities(
        "salary_change",
        baseRows,
        ctx.scenario.id,
      );
      const modified = resolved.find((r) => r.id === base!.id);
      expect((modified as any)._override).toBe("modified");
      expect((modified as any).newSalary).toBe("200000.00");
    });

    it("'delete' override drops the base row", async () => {
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
      const [base] = await db
        .insert(salaryChanges)
        .values({
          companyId: ctx.company.id,
          headcountId: hire!.id,
          effectiveDate: new Date("2026-06-01"),
          newSalary: "130000.00",
        })
        .returning();
      await upsertOverride(
        ctx.scenario.id,
        "salary_change",
        base!.id,
        "delete",
        null,
        base as unknown as Record<string, unknown>,
      );

      const baseRows = await db
        .select()
        .from(salaryChanges)
        .where(eq(salaryChanges.companyId, ctx.company.id));
      const resolved = await resolveEntities(
        "salary_change",
        baseRows,
        ctx.scenario.id,
      );
      expect(resolved.find((r) => r.id === base!.id)).toBeUndefined();
    });
  });

  describe("bonus", () => {
    it("'create' override resolves with tag 'created'", async () => {
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

      const newId = "b-create-1";
      await upsertOverride(
        ctx.scenario.id,
        "bonus",
        newId,
        "create",
        {
          id: newId,
          companyId: ctx.company.id,
          headcountId: hire!.id,
          payoutMonth: new Date("2026-12-01").toISOString(),
          amount: "5000.00",
          type: "performance",
        },
        null,
      );

      const baseRows = await db
        .select()
        .from(bonuses)
        .where(eq(bonuses.companyId, ctx.company.id));
      const resolved = await resolveEntities(
        "bonus",
        baseRows,
        ctx.scenario.id,
      );
      const created = resolved.find(
        (r) => (r as any)._override === "created",
      );
      expect(created).toBeDefined();
      expect((created as any).amount).toBe("5000.00");
      expect((created as any).type).toBe("performance");
    });
  });

  describe("equity_grant", () => {
    it("'create' override resolves with parameters JSONB roundtrip", async () => {
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

      const newId = "eg-create-1";
      const parameters = {
        vestingSchedule: [
          { date: "2026-06-01", percentage: 0.25 },
          { date: "2027-06-01", percentage: 0.25 },
          { date: "2028-06-01", percentage: 0.25 },
          { date: "2029-06-01", percentage: 0.25 },
        ],
        cliffMonths: 12,
      };
      await upsertOverride(
        ctx.scenario.id,
        "equity_grant",
        newId,
        "create",
        {
          id: newId,
          companyId: ctx.company.id,
          headcountId: hire!.id,
          grantDate: new Date("2026-06-01").toISOString(),
          shares: "10000.0000",
          strikePrice: "1.00",
          grantType: "iso",
          parameters,
        },
        null,
      );

      const baseRows = await db
        .select()
        .from(equityGrants)
        .where(eq(equityGrants.companyId, ctx.company.id));
      const resolved = await resolveEntities(
        "equity_grant",
        baseRows,
        ctx.scenario.id,
      );
      const created = resolved.find(
        (r) => (r as any)._override === "created",
      );
      expect(created).toBeDefined();
      expect((created as any).shares).toBe("10000.0000");
      expect((created as any).parameters.vestingSchedule).toHaveLength(4);
      expect((created as any).parameters.cliffMonths).toBe(12);
    });
  });
});
