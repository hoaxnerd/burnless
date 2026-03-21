/**
 * Headcount planning and department tools.
 */

import { db } from "@burnless/db";
import { headcountPlans, departments } from "@burnless/db";
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

export const createDepartmentSchema = z.object({
  name: nameString,
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

// ── Registry ─────────────────────────────────────────────────────────────────

export const headcountSchemas: Record<string, z.ZodType> = {
  add_headcount: addHeadcountSchema,
  create_department: createDepartmentSchema,
};

export const headcountHandlers: Record<string, ToolHandler> = {
  add_headcount: addHeadcount,
  create_department: createDepartment,
};
