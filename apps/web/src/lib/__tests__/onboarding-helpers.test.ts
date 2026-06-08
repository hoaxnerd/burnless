import { describe, it, expect } from "vitest";
import {
  onboardingSchema,
  parseStage,
  parseBusinessModel,
  parseMoneyAmount,
  parseTeamSize,
  SANE_MAX_AMOUNT,
  SANE_MAX_COUNT,
  SANE_MAX_SALARY,
} from "../onboarding-helpers";

// ── parseStage ────────────────────────────────────────────────────────────────

describe("parseStage", () => {
  it("maps 'Pre-seed' to pre_seed", () => {
    expect(parseStage("Pre-seed")).toBe("pre_seed");
  });

  it("maps 'Seed' to seed", () => {
    expect(parseStage("Seed")).toBe("seed");
  });

  it("maps 'Series A' to series_a", () => {
    expect(parseStage("Series A")).toBe("series_a");
  });

  it("maps 'Series B+' to series_b", () => {
    expect(parseStage("Series B+")).toBe("series_b");
  });

  it("maps 'Bootstrapped' to bootstrapped", () => {
    expect(parseStage("Bootstrapped")).toBe("bootstrapped");
  });

  it("handles case-insensitive input", () => {
    expect(parseStage("SERIES A")).toBe("series_a");
    expect(parseStage("pre-seed")).toBe("pre_seed");
    expect(parseStage("bootstrapped")).toBe("bootstrapped");
  });

  it("handles 'Series C' and above", () => {
    expect(parseStage("Series C")).toBe("series_c_plus");
    expect(parseStage("Series C+")).toBe("series_c_plus");
  });

  it("handles alternative phrasings", () => {
    expect(parseStage("Self-funded")).toBe("bootstrapped");
    expect(parseStage("Series B")).toBe("series_b");
  });

  it("defaults to pre_seed for unknown input", () => {
    expect(parseStage("")).toBe("pre_seed");
    expect(parseStage("unknown")).toBe("pre_seed");
    expect(parseStage("growth")).toBe("pre_seed");
  });

  it("distinguishes seed from pre-seed correctly", () => {
    // 'Seed' should NOT match pre_seed (the check for 'pre' should only fire if 'pre' is present)
    expect(parseStage("Seed")).toBe("seed");
    expect(parseStage("Pre-seed")).toBe("pre_seed");
    expect(parseStage("Pre seed")).toBe("pre_seed");
  });
});

// ── parseBusinessModel ────────────────────────────────────────────────────────

describe("parseBusinessModel", () => {
  it("maps 'SaaS' to saas", () => {
    expect(parseBusinessModel("SaaS")).toBe("saas");
  });

  it("maps 'Marketplace' to marketplace", () => {
    expect(parseBusinessModel("Marketplace")).toBe("marketplace");
  });

  it("maps 'E-commerce' to ecommerce", () => {
    expect(parseBusinessModel("E-commerce")).toBe("ecommerce");
  });

  it("maps 'Services' to services", () => {
    expect(parseBusinessModel("Services")).toBe("services");
  });

  it("maps 'Hardware' to hardware", () => {
    expect(parseBusinessModel("Hardware")).toBe("hardware");
  });

  it("maps 'Other' to other", () => {
    expect(parseBusinessModel("Other")).toBe("other");
  });

  it("handles alternative phrasings for SaaS", () => {
    expect(parseBusinessModel("Subscription")).toBe("saas");
    expect(parseBusinessModel("subscription model")).toBe("saas");
  });

  it("handles alternative phrasings for services", () => {
    expect(parseBusinessModel("Consulting")).toBe("services");
    expect(parseBusinessModel("Agency")).toBe("services");
    expect(parseBusinessModel("Professional services")).toBe("services");
  });

  it("handles alternative phrasings for ecommerce", () => {
    expect(parseBusinessModel("Ecommerce")).toBe("ecommerce");
    expect(parseBusinessModel("e-com")).toBe("ecommerce");
  });

  it("handles alternative phrasings for hardware", () => {
    expect(parseBusinessModel("Physical products")).toBe("hardware");
  });

  it("defaults to other for unknown input", () => {
    expect(parseBusinessModel("")).toBe("other");
    expect(parseBusinessModel("something completely different")).toBe("other");
  });
});

// ── parseMoneyAmount ──────────────────────────────────────────────────────────

describe("parseMoneyAmount", () => {
  it("parses zero", () => {
    expect(parseMoneyAmount("$0")).toBe(0);
    expect(parseMoneyAmount("0")).toBe(0);
  });

  it("parses simple dollar amounts", () => {
    expect(parseMoneyAmount("$5000")).toBe(5000);
    expect(parseMoneyAmount("5000")).toBe(5000);
    expect(parseMoneyAmount("$1,000")).toBe(1000);
  });

  it("parses amounts with k suffix", () => {
    expect(parseMoneyAmount("$5k")).toBe(5000);
    expect(parseMoneyAmount("5k")).toBe(5000);
    expect(parseMoneyAmount("$50k")).toBe(50000);
    expect(parseMoneyAmount("100k")).toBe(100000);
  });

  it("parses amounts with 'thousand' suffix", () => {
    expect(parseMoneyAmount("5 thousand")).toBe(5000);
    expect(parseMoneyAmount("$50 thousand")).toBe(50000);
  });

  it("parses amounts with m suffix", () => {
    expect(parseMoneyAmount("$1m")).toBe(1000000);
    expect(parseMoneyAmount("1.5m")).toBe(1500000);
    expect(parseMoneyAmount("$2.5m")).toBe(2500000);
  });

  it("parses amounts with 'million' suffix", () => {
    expect(parseMoneyAmount("1 million")).toBe(1000000);
    expect(parseMoneyAmount("$5 million")).toBe(5000000);
  });

  it("handles decimal amounts", () => {
    expect(parseMoneyAmount("$1.5k")).toBe(1500);
    expect(parseMoneyAmount("2.5m")).toBe(2500000);
  });

  it("rounds to nearest integer", () => {
    expect(parseMoneyAmount("$1.7k")).toBe(1700);
    expect(parseMoneyAmount("$1.75k")).toBe(1750);
  });

  it("handles empty and null-ish input", () => {
    expect(parseMoneyAmount("")).toBe(0);
    expect(parseMoneyAmount("$")).toBe(0);
    expect(parseMoneyAmount("none")).toBe(0);
    expect(parseMoneyAmount("N/A")).toBe(0);
  });

  it("strips whitespace and commas", () => {
    expect(parseMoneyAmount("$ 5,000")).toBe(5000);
    expect(parseMoneyAmount(" $10,000 ")).toBe(10000);
  });

  it("is case insensitive", () => {
    expect(parseMoneyAmount("$5K")).toBe(5000);
    expect(parseMoneyAmount("$1M")).toBe(1000000);
    expect(parseMoneyAmount("5 Million")).toBe(5000000);
  });
});

// ── parseTeamSize ─────────────────────────────────────────────────────────────

describe("parseTeamSize", () => {
  it("parses simple numbers", () => {
    expect(parseTeamSize("1")).toBe(1);
    expect(parseTeamSize("5")).toBe(5);
    expect(parseTeamSize("100")).toBe(100);
  });

  it("extracts number from text", () => {
    expect(parseTeamSize("3 people")).toBe(3);
    expect(parseTeamSize("about 10")).toBe(10);
  });

  it("defaults to 1 when no number found", () => {
    expect(parseTeamSize("")).toBe(1);
    expect(parseTeamSize("many")).toBe(1);
    expect(parseTeamSize("just me")).toBe(1);
  });

  it("takes first number if multiple present", () => {
    expect(parseTeamSize("5-10")).toBe(5);
    expect(parseTeamSize("between 3 and 5")).toBe(3);
  });
});

// ── onboardingSchema (Zod validation) ─────────────────────────────────────────

describe("onboardingSchema", () => {
  it("validates a complete input", () => {
    const input = {
      company_name: "Acme Corp",
      stage: "Seed",
      business_model: "SaaS",
      monthly_revenue: "$10k",
      team_size: "5",
      funding: "$1m",
      main_expenses: "Salaries, Cloud",
    };
    const result = onboardingSchema.parse(input);
    expect(result.company_name).toBe("Acme Corp");
    expect(result.stage).toBe("Seed");
    expect(result.business_model).toBe("SaaS");
    expect(result.monthly_revenue).toBe("$10k");
  });

  it("requires company_name", () => {
    expect(() => onboardingSchema.parse({ company_name: "" })).toThrow(
      "Company name is required"
    );
  });

  it("rejects missing company_name", () => {
    expect(() => onboardingSchema.parse({})).toThrow();
  });

  it("applies defaults when skip is used (minimal input)", () => {
    const result = onboardingSchema.parse({ company_name: "My Startup" });
    expect(result.company_name).toBe("My Startup");
    expect(result.stage).toBe("Pre-seed");
    expect(result.business_model).toBe("SaaS");
    expect(result.monthly_revenue).toBe("0");
    expect(result.team_size).toBe("1");
    expect(result.funding).toBe("0");
    expect(result.main_expenses).toBe("General operations");
  });

  it("preserves user-provided values over defaults", () => {
    const result = onboardingSchema.parse({
      company_name: "My Startup",
      stage: "Series A",
      monthly_revenue: "$50k",
    });
    expect(result.stage).toBe("Series A");
    expect(result.monthly_revenue).toBe("$50k");
    // Others should still get defaults
    expect(result.business_model).toBe("SaaS");
    expect(result.team_size).toBe("1");
  });

  describe("skip flow: all fields use sensible defaults", () => {
    // This simulates what happens when a user clicks "Skip" on the onboarding page.
    // The frontend sends DEFAULTS values to the API. The schema should accept them.
    const SKIP_DEFAULTS = {
      company_name: "My Company",
      stage: "Pre-seed",
      business_model: "SaaS",
      monthly_revenue: "0",
      team_size: "1",
      funding: "0",
      main_expenses: "General operations",
    };

    it("accepts the default values used when skipping", () => {
      const result = onboardingSchema.parse(SKIP_DEFAULTS);
      expect(result).toEqual({
        ...SKIP_DEFAULTS,
        user_name: undefined,
        founders: [],
        funding_rounds: [],
        headcount: [],
        expenses: [],
        revenue_streams: [],
      });
    });

    it("parseStage handles the default 'Pre-seed'", () => {
      expect(parseStage(SKIP_DEFAULTS.stage)).toBe("pre_seed");
    });

    it("parseBusinessModel handles the default 'SaaS'", () => {
      expect(parseBusinessModel(SKIP_DEFAULTS.business_model)).toBe("saas");
    });

    it("parseMoneyAmount handles the default '0' for revenue", () => {
      expect(parseMoneyAmount(SKIP_DEFAULTS.monthly_revenue)).toBe(0);
    });

    it("parseMoneyAmount handles the default '0' for funding", () => {
      expect(parseMoneyAmount(SKIP_DEFAULTS.funding)).toBe(0);
    });

    it("parseTeamSize handles the default '1'", () => {
      expect(parseTeamSize(SKIP_DEFAULTS.team_size)).toBe(1);
    });
  });

  describe("error messages are user-friendly", () => {
    it("shows 'Company name is required' for empty name", () => {
      try {
        onboardingSchema.parse({ company_name: "" });
      } catch (e) {
        if (e instanceof Error && "errors" in e) {
          const zodError = e as { errors: Array<{ message: string }> };
          expect(zodError.errors[0]?.message).toBe("Company name is required");
        }
      }
    });

    it("does not expose technical field paths in validation errors", () => {
      try {
        onboardingSchema.parse({ company_name: "" });
      } catch (e) {
        if (e instanceof Error && "errors" in e) {
          const zodError = e as { errors: Array<{ message: string }> };
          const msg = zodError.errors[0]?.message ?? "";
          expect(msg).not.toMatch(/z\.string/);
          expect(msg).not.toMatch(/ZodError/);
        }
      }
    });
  });

  describe("complex arrays validation", () => {
    it("validates and parses valid founders, funding rounds, headcount, expenses, and revenue streams", () => {
      const input = {
        company_name: "Acme Corp",
        founders: ["John Doe", "Jane Smith"],
        funding_rounds: [
          {
            name: "Seed Round",
            type: "seed",
            amount: 1500000,
            date: "2026-05-15",
            preMoneyValuation: 8000000,
            dilutionPercent: 15,
            notes: "VC lead",
          },
        ],
        headcount: [
          {
            title: "Engineer",
            department: "Engineering",
            employeeType: "full_time",
            salary: 120000,
            startDate: "2026-06-01",
          },
        ],
        expenses: [
          {
            name: "AWS",
            category: "Cloud Infrastructure",
            amount: 2000,
            startDate: "2026-06-01",
            isRecurring: true,
          },
        ],
        revenue_streams: [
          {
            name: "SaaS Pro",
            type: "subscription",
            amount: 49,
            quantity: 100,
            startDate: "2026-06-01",
            notes: "Self-serve",
          },
        ],
      };
      const result = onboardingSchema.parse(input);
      expect(result.founders).toEqual(["John Doe", "Jane Smith"]);
      expect(result.funding_rounds[0]?.amount).toBe(1500000);
      expect(result.headcount[0]?.salary).toBe(120000);
      expect(result.expenses[0]?.amount).toBe(2000);
      expect(result.revenue_streams[0]?.quantity).toBe(100);
    });

    it("rejects invalid types or missing fields in arrays", () => {
      const input = {
        company_name: "Acme Corp",
        funding_rounds: [
          {
            name: "Seed Round",
            // missing type
            amount: 1500000,
            date: "2026-05-15",
          },
        ],
      };
      expect(() => onboardingSchema.parse(input)).toThrow();
    });
  });

  // ── ONB-02: sane upper bounds on financial values ─────────────────────────
  describe("ONB-02 financial value bounds", () => {
    const base = { company_name: "Acme Corp" };

    it("rejects a revenue_streams amount above the hard max", () => {
      expect(() =>
        onboardingSchema.parse({
          ...base,
          revenue_streams: [
            {
              name: "Huge",
              type: "subscription",
              amount: SANE_MAX_AMOUNT + 1,
              quantity: 10,
              startDate: "2026-06-01",
            },
          ],
        }),
      ).toThrow();
    });

    it("rejects a negative revenue_streams amount", () => {
      expect(() =>
        onboardingSchema.parse({
          ...base,
          revenue_streams: [
            {
              name: "Neg",
              type: "subscription",
              amount: -5,
              quantity: 10,
              startDate: "2026-06-01",
            },
          ],
        }),
      ).toThrow();
    });

    it("rejects a quantity above the count max", () => {
      expect(() =>
        onboardingSchema.parse({
          ...base,
          revenue_streams: [
            {
              name: "Q",
              type: "usage_based",
              amount: 1,
              quantity: SANE_MAX_COUNT + 1,
              startDate: "2026-06-01",
            },
          ],
        }),
      ).toThrow();
    });

    it("rejects a headcount salary above the salary max", () => {
      expect(() =>
        onboardingSchema.parse({
          ...base,
          headcount: [
            {
              title: "CEO",
              department: "Engineering",
              employeeType: "full_time",
              salary: SANE_MAX_SALARY + 1,
              startDate: "2026-06-01",
            },
          ],
        }),
      ).toThrow();
    });

    it("rejects a negative headcount salary", () => {
      expect(() =>
        onboardingSchema.parse({
          ...base,
          headcount: [
            {
              title: "CEO",
              department: "Engineering",
              employeeType: "full_time",
              salary: -1,
              startDate: "2026-06-01",
            },
          ],
        }),
      ).toThrow();
    });

    it("rejects a funding_rounds amount above the hard max", () => {
      expect(() =>
        onboardingSchema.parse({
          ...base,
          funding_rounds: [
            {
              name: "Mega",
              type: "seed",
              amount: SANE_MAX_AMOUNT + 1,
              date: "2026-06-01",
            },
          ],
        }),
      ).toThrow();
    });

    it("rejects a monthly_revenue string whose parsed value exceeds the hard max", () => {
      // 2 trillion > SANE_MAX_AMOUNT (1e12)
      expect(() =>
        onboardingSchema.parse({ ...base, monthly_revenue: "2000000000000" }),
      ).toThrow();
    });

    it("rejects a funding string whose parsed value exceeds the hard max", () => {
      expect(() =>
        onboardingSchema.parse({ ...base, funding: "5000000000000" }),
      ).toThrow();
    });

    it("rejects a team_size string whose parsed value exceeds the count max", () => {
      expect(() =>
        onboardingSchema.parse({ ...base, team_size: "200000" }),
      ).toThrow();
    });

    it("accepts reasonable financial values", () => {
      const result = onboardingSchema.parse({
        ...base,
        monthly_revenue: "$50k",
        funding: "$2m",
        team_size: "12",
        revenue_streams: [
          {
            name: "Pro",
            type: "subscription",
            amount: 99,
            quantity: 500,
            startDate: "2026-06-01",
          },
        ],
        headcount: [
          {
            title: "Engineer",
            department: "Engineering",
            employeeType: "full_time",
            salary: 180000,
            startDate: "2026-06-01",
          },
        ],
        funding_rounds: [
          {
            name: "Seed",
            type: "seed",
            amount: 2_000_000,
            date: "2026-06-01",
          },
        ],
      });
      expect(result.revenue_streams[0]?.amount).toBe(99);
      expect(result.headcount[0]?.salary).toBe(180000);
      expect(result.funding_rounds[0]?.amount).toBe(2_000_000);
    });

    it("accepts amount/salary exactly at the max", () => {
      const result = onboardingSchema.parse({
        ...base,
        headcount: [
          {
            title: "Founder",
            department: "Engineering",
            employeeType: "full_time",
            salary: SANE_MAX_SALARY,
            startDate: "2026-06-01",
          },
        ],
      });
      expect(result.headcount[0]?.salary).toBe(SANE_MAX_SALARY);
    });
  });
});
