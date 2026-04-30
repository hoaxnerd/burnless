/**
 * Headcount planning and department tools — CRUD operations.
 */

import {
  db,
  scenarioInsert,
  scenarioUpdate,
  scenarioDelete,
  createSalaryChange,
  createBonus,
  createEquityGrant,
} from "@burnless/db";
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

export const addSalaryChangeSchema = z.object({
  headcountId: idString,
  effectiveDate: dateString,
  newSalary: salaryAmount,
  reason: z.string().max(500).nullable().optional(),
});

export const addBonusSchema = z.object({
  headcountId: idString,
  payoutMonth: z
    .string()
    .min(1, "payoutMonth is required")
    .refine(
      (v) => /^\d{4}-\d{2}(-\d{2})?$/.test(v) && !isNaN(Date.parse(v.length === 7 ? `${v}-01` : v)),
      "payoutMonth must be YYYY-MM or YYYY-MM-DD"
    ),
  amount: z.number().positive("Bonus amount must be > 0").max(100_000_000, "Bonus amount exceeds 100,000,000 limit"),
  type: z.enum(["signing", "performance", "retention", "other"]).default("performance"),
  notes: z.string().max(2000).nullable().optional(),
});

const vestingMilestoneSchema = z.object({
  type: z.enum(["cliff", "monthly", "quarterly", "annual", "milestone"]),
  date: dateString,
  sharesVested: z.number().nonnegative(),
});

export const addEquityGrantSchema = z
  .object({
    headcountId: idString,
    grantDate: dateString,
    shares: z.number().positive("Shares must be > 0"),
    strikePrice: z.number().nonnegative().nullable().optional(),
    grantType: z.enum(["iso", "nso", "rsu"]).default("iso"),
    vestingSchedule: z.array(vestingMilestoneSchema).default([]),
  })
  .superRefine((data, ctx) => {
    const total = data.vestingSchedule.reduce((s, v) => s + v.sharesVested, 0);
    if (total > data.shares) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vestingSchedule"],
        message: `Vested shares total (${total}) exceeds grant shares (${data.shares})`,
      });
    }
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

async function verifyHeadcountOwnership(
  headcountId: string,
  companyId: string
): Promise<{ id: string } | null> {
  const [parent] = await db
    .select({ id: headcountPlans.id })
    .from(headcountPlans)
    .where(and(eq(headcountPlans.id, headcountId), eq(headcountPlans.companyId, companyId)));
  return parent ?? null;
}

async function addSalaryChange(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof addSalaryChangeSchema>;

  const parent = await verifyHeadcountOwnership(data.headcountId, context.companyId);
  if (!parent) {
    return JSON.stringify({ success: false, error: "Headcount not found or access denied" });
  }

  const row = await createSalaryChange(
    {
      companyId: context.companyId,
      headcountId: data.headcountId,
      effectiveDate: new Date(data.effectiveDate),
      newSalary: num(data.newSalary)!,
      reason: data.reason ?? null,
    },
    context.scenarioId
  );

  return JSON.stringify({
    success: true,
    salaryChangeId: row!.id,
    message: `Added salary change effective ${data.effectiveDate}.`,
  });
}

async function addBonus(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof addBonusSchema>;

  const parent = await verifyHeadcountOwnership(data.headcountId, context.companyId);
  if (!parent) {
    return JSON.stringify({ success: false, error: "Headcount not found or access denied" });
  }

  // Normalize YYYY-MM to a Date at the first of the month.
  const monthStr = data.payoutMonth.length === 7 ? `${data.payoutMonth}-01` : data.payoutMonth;

  const row = await createBonus(
    {
      companyId: context.companyId,
      headcountId: data.headcountId,
      payoutMonth: new Date(monthStr),
      amount: num(data.amount)!,
      type: data.type,
      notes: data.notes ?? null,
    },
    context.scenarioId
  );

  return JSON.stringify({
    success: true,
    bonusId: row!.id,
    message: `Added ${data.type} bonus for ${data.payoutMonth}.`,
  });
}

async function addEquityGrant(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof addEquityGrantSchema>;

  const parent = await verifyHeadcountOwnership(data.headcountId, context.companyId);
  if (!parent) {
    return JSON.stringify({ success: false, error: "Headcount not found or access denied" });
  }

  const row = await createEquityGrant(
    {
      companyId: context.companyId,
      headcountId: data.headcountId,
      grantDate: new Date(data.grantDate),
      shares: data.shares.toFixed(4),
      strikePrice:
        data.strikePrice === undefined || data.strikePrice === null
          ? null
          : data.strikePrice.toFixed(4),
      grantType: data.grantType,
      parameters: { vestingSchedule: data.vestingSchedule },
    },
    context.scenarioId
  );

  return JSON.stringify({
    success: true,
    equityGrantId: row!.id,
    message: `Added ${data.grantType.toUpperCase()} grant of ${data.shares} shares on ${data.grantDate}.`,
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
  add_salary_change: addSalaryChangeSchema,
  add_bonus: addBonusSchema,
  add_equity_grant: addEquityGrantSchema,
};

export const headcountHandlers: Record<string, ToolHandler> = {
  add_headcount: addHeadcount,
  update_headcount: updateHeadcount,
  delete_headcount: deleteHeadcount,
  create_department: createDepartment,
  update_department: updateDepartment,
  delete_department: deleteDepartment,
  add_salary_change: addSalaryChange,
  add_bonus: addBonus,
  add_equity_grant: addEquityGrant,
};

// `headcount` is exported for back-compat; not used here directly.
void headcount;
