/**
 * Headcount form parameter types, defaults, normalization, and validation.
 *
 * Used by the consolidated <HeadcountForm> (Phase 1 §1.7, §2.E). Keeps the
 * form pure — no React imports — so the same shape can be reused server-side
 * if needed.
 */

import { z } from "zod";

export const employeeTypeSchema = z.enum(["full_time", "part_time", "contractor"]);
export type EmployeeType = z.infer<typeof employeeTypeSchema>;

export const benefitsBreakdownSchema = z.object({
  statutoryEmployerContributionsCost: z.number().min(0).max(1).optional(),
  insuranceBenefitsCost: z.number().min(0).max(1).optional(),
  retirementContributionsCost: z.number().min(0).max(1).optional(),
  otherBenefitsCost: z.number().min(0).max(1).optional(),
});
export type BenefitsBreakdown = z.infer<typeof benefitsBreakdownSchema>;

export interface HeadcountFormState {
  title: string;
  name: string;
  employeeType: EmployeeType;
  count: number;          // FTE, e.g. 0.5
  salary: number;         // annual; ignored for contractor
  hourlyRate: number | null;
  hoursPerWeek: number | null;
  startDate: string;      // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD or null
  departmentId: string;
  benefitsRate: number;   // legacy fallback (decimal, e.g. 0.20 = 20%)
  benefitsBreakdown: BenefitsBreakdown;
}

export const FULL_TIME_HOURS_PER_WEEK = 40;

export function defaultHeadcountForm(opts: {
  departmentId?: string;
  companyDefaults?: BenefitsBreakdown;
}): HeadcountFormState {
  return {
    title: "",
    name: "",
    employeeType: "full_time",
    count: 1,
    salary: 0,
    hourlyRate: null,
    hoursPerWeek: null,
    startDate: nextMonthStart(),
    endDate: null,
    departmentId: opts.departmentId ?? "",
    benefitsRate: 0.20,
    benefitsBreakdown: opts.companyDefaults ?? {},
  };
}

function nextMonthStart(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Normalize a form state into the API payload shape.
 * Used by both POST /api/headcount and PATCH /api/headcount/[id].
 *
 * - full_time: salary kept; hourlyRate/hoursPerWeek nulled.
 * - part_time: salary kept; hoursPerWeek kept; hourlyRate nulled.
 * - contractor: salary forced to 0; hourlyRate + hoursPerWeek kept.
 *
 * `parameters.benefitsBreakdown` is only included when at least one slot is set.
 */
export function normalizeHeadcountPayload(state: HeadcountFormState): Record<string, unknown> {
  const benefitsBreakdown = stripEmptyKeys(state.benefitsBreakdown);
  const hasBreakdown = Object.keys(benefitsBreakdown).length > 0;

  return {
    title: state.title.trim(),
    name: state.name.trim() || null,
    employeeType: state.employeeType,
    count: state.count,
    salary: state.employeeType === "contractor" ? 0 : state.salary,
    hourlyRate: state.employeeType === "contractor" ? state.hourlyRate : null,
    hoursPerWeek:
      state.employeeType === "full_time" ? null : state.hoursPerWeek,
    departmentId: state.departmentId,
    startDate: state.startDate,
    endDate: state.endDate,
    benefitsRate: state.benefitsRate,
    parameters: hasBreakdown ? { benefitsBreakdown } : {},
  };
}

function stripEmptyKeys(b: BenefitsBreakdown): BenefitsBreakdown {
  const out: BenefitsBreakdown = {};
  for (const [k, v] of Object.entries(b)) {
    if (v !== undefined && v !== null) {
      (out as Record<string, number>)[k] = v as number;
    }
  }
  return out;
}

/** Validate the form state. Returns either { ok: true, data } or { ok: false, errors }. */
export const headcountFormSchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    departmentId: z.string().min(1, "Department is required"),
    employeeType: employeeTypeSchema,
    count: z.number().min(0.01).max(99.99),
    salary: z.number().min(0).max(100_000_000),
    hourlyRate: z.number().nonnegative().nullable(),
    hoursPerWeek: z.number().min(0).max(168).nullable(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    benefitsRate: z.number().min(0).max(2),
    benefitsBreakdown: benefitsBreakdownSchema,
  })
  .superRefine((data, ctx) => {
    if (data.employeeType === "contractor" && (!data.hourlyRate || data.hourlyRate <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hourlyRate"],
        message: "Hourly rate is required for contractors",
      });
    }
    if (data.employeeType === "contractor" && (!data.hoursPerWeek || data.hoursPerWeek <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hoursPerWeek"],
        message: "Hours per week is required for contractors",
      });
    }
    if (data.employeeType === "part_time" && (!data.hoursPerWeek || data.hoursPerWeek <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hoursPerWeek"],
        message: "Hours per week is required for part-time",
      });
    }
    if (data.employeeType !== "contractor" && data.salary <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["salary"],
        message: "Salary must be > 0 for full-time and part-time",
      });
    }
  });

export function validateHeadcountForm(
  state: HeadcountFormState,
):
  | { ok: true; data: z.infer<typeof headcountFormSchema> }
  | { ok: false; errors: Record<string, string> } {
  const result = headcountFormSchema.safeParse(state);
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
