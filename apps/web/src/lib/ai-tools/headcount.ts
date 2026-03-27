/**
 * Headcount planning and department tools — CRUD operations.
 */

import { db } from "@burnless/db";
import { headcountPlans, departments, scenarios } from "@burnless/db";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import type { ToolContext, ToolHandler } from "./types";
import {
  nameString,
  optionalId,
  idString,
  headcount,
  salaryAmount,
  dateString,
  optionalDate,
  benefitsRate,
} from "./types";

// ── Schemas ──────────────────────────────────────────────────────────────────

export const addHeadcountSchema = z.object({
  scenarioId: optionalId,
  departmentId: idString,
  title: nameString,
  count: headcount,
  salary: salaryAmount,
  startDate: dateString,
  endDate: optionalDate,
  benefitsRate: benefitsRate,
});

export const updateHeadcountSchema = z.object({
  id: idString,
  title: nameString.optional(),
  count: headcount.optional(),
  salary: salaryAmount.optional(),
  startDate: dateString.optional(),
  endDate: optionalDate,
  benefitsRate: benefitsRate.optional(),
  departmentId: idString.optional(),
});

export const deleteHeadcountSchema = z.object({
  id: idString,
});

export const createDepartmentSchema = z.object({
  name: nameString,
});

export const updateDepartmentSchema = z.object({
  id: idString,
  name: nameString.optional(),
});

export const deleteDepartmentSchema = z.object({
  id: idString,
});

// ── Handlers ─────────────────────────────────────────────────────────────────

async function addHeadcount(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof addHeadcountSchema>;
  const scenarioId = data.scenarioId || context.scenarioId;

  const [row] = await db
    .insert(headcountPlans)
    .values({
      scenarioId,
      departmentId: data.departmentId,
      title: data.title,
      count: data.count,
      salary: String(data.salary),
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      benefitsRate: String(data.benefitsRate),
    })
    .returning();

  const totalCost = data.count * data.salary * (1 + data.benefitsRate);

  return JSON.stringify({
    success: true,
    headcountPlanId: row!.id,
    message: `Added ${data.count}x ${data.title} at $${data.salary.toLocaleString()}/year each. Total annual cost: $${totalCost.toLocaleString()} (including benefits).`,
  });
}

async function createDepartment(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof createDepartmentSchema>;
  const [row] = await db
    .insert(departments)
    .values({
      companyId: context.companyId,
      name: data.name,
    })
    .returning();

  return JSON.stringify({
    success: true,
    departmentId: row!.id,
    message: `Created department "${data.name}". ID: ${row!.id}`,
  });
}

async function updateHeadcount(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof updateHeadcountSchema>;

  // Verify ownership via scenario -> company chain
  const [existing] = await db
    .select({ id: headcountPlans.id, scenarioId: headcountPlans.scenarioId, title: headcountPlans.title })
    .from(headcountPlans)
    .innerJoin(scenarios, eq(headcountPlans.scenarioId, scenarios.id))
    .where(and(eq(headcountPlans.id, data.id), eq(scenarios.companyId, context.companyId), isNull(scenarios.deletedAt)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Headcount plan not found or access denied" });
  }

  const updates: Record<string, unknown> = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.count !== undefined) updates.count = data.count;
  if (data.salary !== undefined) updates.salary = String(data.salary);
  if (data.startDate !== undefined) updates.startDate = new Date(data.startDate);
  if (data.endDate !== undefined) updates.endDate = data.endDate ? new Date(data.endDate) : null;
  if (data.benefitsRate !== undefined) updates.benefitsRate = String(data.benefitsRate);
  if (data.departmentId !== undefined) updates.departmentId = data.departmentId;

  if (Object.keys(updates).length === 0) {
    return JSON.stringify({ success: false, error: "No fields to update" });
  }

  await db.update(headcountPlans).set(updates).where(eq(headcountPlans.id, data.id));

  return JSON.stringify({
    success: true,
    message: `Updated headcount plan "${data.title ?? existing.title}".`,
  });
}

async function deleteHeadcount(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof deleteHeadcountSchema>;

  const [existing] = await db
    .select({ id: headcountPlans.id, title: headcountPlans.title })
    .from(headcountPlans)
    .innerJoin(scenarios, eq(headcountPlans.scenarioId, scenarios.id))
    .where(and(eq(headcountPlans.id, data.id), eq(scenarios.companyId, context.companyId), isNull(scenarios.deletedAt)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Headcount plan not found or access denied" });
  }

  await db.delete(headcountPlans).where(eq(headcountPlans.id, data.id));

  return JSON.stringify({
    success: true,
    message: `Deleted headcount plan "${existing.title}".`,
  });
}

async function updateDepartment(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof updateDepartmentSchema>;

  const [existing] = await db
    .select({ id: departments.id })
    .from(departments)
    .where(and(eq(departments.id, data.id), eq(departments.companyId, context.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Department not found or access denied" });
  }

  if (!data.name) {
    return JSON.stringify({ success: false, error: "No fields to update" });
  }

  await db.update(departments).set({ name: data.name }).where(eq(departments.id, data.id));

  return JSON.stringify({
    success: true,
    message: `Renamed department to "${data.name}".`,
  });
}

async function deleteDepartment(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof deleteDepartmentSchema>;

  const [existing] = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(and(eq(departments.id, data.id), eq(departments.companyId, context.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Department not found or access denied" });
  }

  await db.delete(departments).where(eq(departments.id, data.id));

  return JSON.stringify({
    success: true,
    message: `Deleted department "${existing.name}" and all associated headcount plans.`,
  });
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const headcountSchemas: Record<string, z.ZodType> = {
  add_headcount: addHeadcountSchema,
  update_headcount: updateHeadcountSchema,
  delete_headcount: deleteHeadcountSchema,
  create_department: createDepartmentSchema,
  update_department: updateDepartmentSchema,
  delete_department: deleteDepartmentSchema,
};

export const headcountHandlers: Record<string, ToolHandler> = {
  add_headcount: addHeadcount,
  update_headcount: updateHeadcount,
  delete_headcount: deleteHeadcount,
  create_department: createDepartment,
  update_department: updateDepartment,
  delete_department: deleteDepartment,
};
