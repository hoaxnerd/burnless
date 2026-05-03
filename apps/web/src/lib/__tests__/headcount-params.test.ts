import { describe, expect, it } from "vitest";
import {
  defaultHeadcountForm,
  normalizeHeadcountPayload,
  validateHeadcountForm,
  type HeadcountFormState,
} from "../headcount-params";

function baseState(overrides: Partial<HeadcountFormState> = {}): HeadcountFormState {
  return {
    title: "Engineer",
    name: "",
    employeeType: "full_time",
    count: 1,
    salary: 100_000,
    hourlyRate: null,
    hoursPerWeek: null,
    startDate: "2026-06-01",
    endDate: null,
    departmentId: "d1",
    benefitsRate: 0.2,
    benefitsBreakdown: {},
    ...overrides,
  };
}

describe("defaultHeadcountForm", () => {
  it("returns sensible defaults", () => {
    const f = defaultHeadcountForm({ departmentId: "d-1" });
    expect(f.employeeType).toBe("full_time");
    expect(f.count).toBe(1);
    expect(f.salary).toBe(0);
    expect(f.hourlyRate).toBeNull();
    expect(f.hoursPerWeek).toBeNull();
    expect(f.benefitsRate).toBeCloseTo(0.2);
    expect(f.benefitsBreakdown).toEqual({});
    expect(f.departmentId).toBe("d-1");
    expect(f.startDate).toMatch(/^\d{4}-\d{2}-01$/);
    expect(f.endDate).toBeNull();
  });

  it("seeds benefitsBreakdown from companyDefaults when provided", () => {
    const f = defaultHeadcountForm({
      companyDefaults: { insuranceBenefitsCost: 0.05, retirementContributionsCost: 0.03 },
    });
    expect(f.benefitsBreakdown).toEqual({
      insuranceBenefitsCost: 0.05,
      retirementContributionsCost: 0.03,
    });
  });
});

describe("normalizeHeadcountPayload", () => {
  it("full_time: omits hourlyRate/hoursPerWeek (null), keeps salary", () => {
    const p = normalizeHeadcountPayload(baseState({ employeeType: "full_time", salary: 120_000 }));
    expect(p.employeeType).toBe("full_time");
    expect(p.salary).toBe(120_000);
    expect(p.hourlyRate).toBeNull();
    expect(p.hoursPerWeek).toBeNull();
  });

  it("part_time: keeps hoursPerWeek but sets hourlyRate to null", () => {
    const p = normalizeHeadcountPayload(
      baseState({ employeeType: "part_time", salary: 60_000, hoursPerWeek: 20, hourlyRate: 50 }),
    );
    expect(p.employeeType).toBe("part_time");
    expect(p.salary).toBe(60_000);
    expect(p.hoursPerWeek).toBe(20);
    expect(p.hourlyRate).toBeNull();
  });

  it("contractor: includes hourlyRate + hoursPerWeek and sets salary to 0", () => {
    const p = normalizeHeadcountPayload(
      baseState({
        employeeType: "contractor",
        salary: 99_999, // should be wiped
        hourlyRate: 75,
        hoursPerWeek: 30,
      }),
    );
    expect(p.employeeType).toBe("contractor");
    expect(p.salary).toBe(0);
    expect(p.hourlyRate).toBe(75);
    expect(p.hoursPerWeek).toBe(30);
  });

  it("skips empty benefitsBreakdown (no parameters.benefitsBreakdown if all keys empty)", () => {
    const p = normalizeHeadcountPayload(baseState({ benefitsBreakdown: {} }));
    expect(p.parameters).toEqual({});
  });

  it("includes parameters.benefitsBreakdown when at least one key set", () => {
    const p = normalizeHeadcountPayload(
      baseState({ benefitsBreakdown: { insuranceBenefitsCost: 0.07 } }),
    );
    expect(p.parameters).toEqual({ benefitsBreakdown: { insuranceBenefitsCost: 0.07 } });
  });

  it("trims title and converts blank name to null", () => {
    const p = normalizeHeadcountPayload(baseState({ title: "  Lead  ", name: "   " }));
    expect(p.title).toBe("Lead");
    expect(p.name).toBeNull();
  });
});

describe("validateHeadcountForm", () => {
  it("rejects contractor with no hourly rate", () => {
    const r = validateHeadcountForm(
      baseState({ employeeType: "contractor", salary: 0, hourlyRate: null, hoursPerWeek: 30 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.hourlyRate).toMatch(/Hourly rate is required/);
    }
  });

  it("rejects contractor with hourly rate but no hoursPerWeek", () => {
    const r = validateHeadcountForm(
      baseState({ employeeType: "contractor", salary: 0, hourlyRate: 75, hoursPerWeek: null }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.hoursPerWeek).toMatch(/Hours per week is required/);
  });

  it("rejects part_time with no hoursPerWeek", () => {
    const r = validateHeadcountForm(
      baseState({ employeeType: "part_time", salary: 60_000, hoursPerWeek: null }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.hoursPerWeek).toMatch(/Hours per week is required/);
  });

  it("rejects salary=0 for full_time", () => {
    const r = validateHeadcountForm(baseState({ employeeType: "full_time", salary: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.salary).toMatch(/Salary must be/);
  });

  it("accepts a valid full_time entry", () => {
    const r = validateHeadcountForm(baseState());
    expect(r.ok).toBe(true);
  });

  it("accepts a valid contractor entry", () => {
    const r = validateHeadcountForm(
      baseState({ employeeType: "contractor", salary: 0, hourlyRate: 80, hoursPerWeek: 25 }),
    );
    expect(r.ok).toBe(true);
  });
});
