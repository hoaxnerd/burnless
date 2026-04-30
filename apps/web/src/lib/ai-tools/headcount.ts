/**
 * Headcount planning and department tools — CRUD operations.
 */

import { db, scenarioInsert, scenarioUpdate, scenarioDelete } from "@burnless/db";
import { headcountPlans, departments, companies } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { formatCurrency, isValidCurrency } from "@burnless/types";
import type { ToolContext, ToolHandler } from "./types";
import {
  nameString,
  idString,
  headcount,
  headcountFte,
  salaryAmount,
  hourlyRate,
  hoursPerWeek,
  employeeType,
  dateString,
  optionalDate,
  benefitsRate,
} from "./types";

// ── Schemas ──────────────────────────────────────────────────────────────────

const benefitsBreakdownSchema = z.object({
  statutoryEmployerContributionsCost: z.number().min(0).max(1).optional(),
  insuranceBenefitsCost: z.number().min(0).max(1).optional(),
  retirementContributionsCost: z.number().min(0).max(1).optional(),
  otherBenefitsCost: z.number().min(0).max(1).optional(),
});

const headcountParametersSchema = z
  .object({
    benefitsBreakdown: benefitsBreakdownSchema.optional(),
  })
  .passthrough();

export const addHeadcountSchema = z.object({
  departmentId: idString,
  title: nameString,
  name: z.string().nullable().optional(),
  employeeType: employeeType.optional(),
  count: headcountFte.optional().default(1),
  salary: salaryAmount,
  hourlyRate: hourlyRate,
  hoursPerWeek: hoursPerWeek,
  startDate: dateString,
  endDate: optionalDate,
  benefitsRate: benefitsRate,
  parameters: headcountParametersSchema.optional(),
});

export const updateHeadcountSchema = z.object({
  id: idString,
  title: nameString.optional(),
  name: z.string().nullable().optional(),
  employeeType: employeeType.optional(),
  count: headcountFte.optional(),
  salary: salaryAmount.optional(),
  hourlyRate: hourlyRate,
  hoursPerWeek: hoursPerWeek,
  startDate: dateString.optional(),
  endDate: optionalDate,
  benefitsRate: benefitsRate.optional(),
  parameters: headcountParametersSchema.optional(),
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

/** Convert a numeric Zod-validated value to the string Drizzle expects for `numeric` columns. */
function num(v: number | null | undefined, decimals = 2): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return v.toFixed(decimals);
}

async function addHeadcount(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof addHeadcountSchema>;

  const [company] = await db
    .select({ currency: companies.currency, locale: companies.locale })
    .from(companies)
    .where(eq(companies.id, context.companyId))
    .limit(1);
  const currency = company?.currency && isValidCurrency(company.currency) ? company.currency : "USD";
  const locale = company?.locale ?? undefined;

  const insertValues: Record<string, unknown> = {
    companyId: context.companyId,
    departmentId: data.departmentId,
    title: data.title,
    salary: num(data.salary)!,
    startDate: new Date(data.startDate),
    endDate: data.endDate ? new Date(data.endDate) : null,
    benefitsRate: num(data.benefitsRate)!,
  };

  if (data.name !== undefined) insertValues.name = data.name;
  if (data.employeeType !== undefined) insertValues.employeeType = data.employeeType;
  if (data.count !== undefined) insertValues.count = num(data.count)!;
  if (data.hourlyRate !== undefined) insertValues.hourlyRate = num(data.hourlyRate);
  if (data.hoursPerWeek !== undefined) insertValues.hoursPerWeek = num(data.hoursPerWeek);
  if (data.parameters !== undefined) insertValues.parameters = data.parameters;

  const row = await scenarioInsert(
    "headcount_plan",
    headcountPlans,
    insertValues,
    context.scenarioId
  );

  const fteCount = data.count ?? 1;
  const totalCost = fteCount * data.salary * (1 + data.benefitsRate);

  return JSON.stringify({
    success: true,
    headcountPlanId: row!.id,
    message: `Added ${fteCount}x ${data.title} at ${formatCurrency(data.salary, currency, locale)}/year each. Total annual cost: ${formatCurrency(totalCost, currency, locale)} (including benefits).`,
  });
}

async function createDepartment(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof createDepartmentSchema>;

  const row = await scenarioInsert("department", departments, {
    companyId: context.companyId,
    name: data.name,
  }, context.scenarioId);

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

  // Verify ownership
  const [existing] = await db
    .select({
      id: headcountPlans.id,
      title: headcountPlans.title,
      companyId: headcountPlans.companyId,
      parameters: headcountPlans.parameters,
    })
    .from(headcountPlans)
    .where(and(eq(headcountPlans.id, data.id), eq(headcountPlans.companyId, context.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Headcount plan not found or access denied" });
  }

  const updates: Record<string, unknown> = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.name !== undefined) updates.name = data.name;
  if (data.employeeType !== undefined) updates.employeeType = data.employeeType;
  if (data.count !== undefined) updates.count = num(data.count);
  if (data.salary !== undefined) updates.salary = num(data.salary);
  if (data.hourlyRate !== undefined) updates.hourlyRate = num(data.hourlyRate);
  if (data.hoursPerWeek !== undefined) updates.hoursPerWeek = num(data.hoursPerWeek);
  if (data.startDate !== undefined) updates.startDate = new Date(data.startDate);
  if (data.endDate !== undefined) updates.endDate = data.endDate ? new Date(data.endDate) : null;
  if (data.benefitsRate !== undefined) updates.benefitsRate = num(data.benefitsRate);
  if (data.departmentId !== undefined) updates.departmentId = data.departmentId;

  if (data.parameters !== undefined) {
    // Deep-merge benefitsBreakdown manually; scenarioUpdate's mergeChanges only
    // does shallow-merge of `parameters` keys, which would clobber sibling keys
    // inside benefitsBreakdown (e.g. setting only insuranceBenefitsCost would
    // wipe statutoryEmployerContributionsCost).
    const current = (existing.parameters ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...current };
    if (data.parameters.benefitsBreakdown) {
      const currentBreakdown = (current.benefitsBreakdown ?? {}) as Record<string, unknown>;
      next.benefitsBreakdown = { ...currentBreakdown, ...data.parameters.benefitsBreakdown };
    }
    for (const [k, v] of Object.entries(data.parameters)) {
      if (k !== "benefitsBreakdown") next[k] = v;
    }
    updates.parameters = next;
  }

  if (Object.keys(updates).length === 0) {
    return JSON.stringify({ success: false, error: "No fields to update" });
  }

  await scenarioUpdate("headcount_plan", headcountPlans, data.id, updates, context.scenarioId);

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

  // Verify ownership
  const [existing] = await db
    .select({ id: headcountPlans.id, title: headcountPlans.title, companyId: headcountPlans.companyId })
    .from(headcountPlans)
    .where(and(eq(headcountPlans.id, data.id), eq(headcountPlans.companyId, context.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Headcount plan not found or access denied" });
  }

  await scenarioDelete("headcount_plan", headcountPlans, data.id, context.scenarioId);

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

  await scenarioUpdate("department", departments, data.id, { name: data.name }, context.scenarioId);

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

  await scenarioDelete("department", departments, data.id, context.scenarioId);

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

// `headcount` is exported for back-compat; not used here directly.
void headcount;
