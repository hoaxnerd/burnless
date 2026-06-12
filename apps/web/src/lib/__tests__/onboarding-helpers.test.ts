import { describe, it, expect } from "vitest";
import {
  onboardingSchema,
  parseStage,
  parseBusinessModel,
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

// ── onboardingSchema (Zod validation) ─────────────────────────────────────────

describe("onboardingSchema (slim: company + scaffolding fields only)", () => {
  it("validates a complete input", () => {
    const input = {
      company_name: "Acme Corp",
      stage: "Seed",
      business_model: "SaaS",
      industry: "Fintech",
      user_name: "Jane Founder",
      founders: ["Jane Founder"],
    };
    const result = onboardingSchema.parse(input);
    expect(result.company_name).toBe("Acme Corp");
    expect(result.stage).toBe("Seed");
    expect(result.business_model).toBe("SaaS");
    expect(result.industry).toBe("Fintech");
    expect(result.user_name).toBe("Jane Founder");
    expect(result.founders).toEqual(["Jane Founder"]);
  });

  it("requires company_name", () => {
    expect(() => onboardingSchema.parse({ company_name: "" })).toThrow(
      "Company name is required"
    );
  });

  it("rejects missing company_name", () => {
    expect(() => onboardingSchema.parse({})).toThrow();
  });

  it("applies defaults when minimal input is given", () => {
    const result = onboardingSchema.parse({ company_name: "My Startup" });
    expect(result.company_name).toBe("My Startup");
    expect(result.stage).toBe("Pre-seed");
    expect(result.business_model).toBe("SaaS");
    expect(result.founders).toEqual([]);
    expect(result.user_name).toBeUndefined();
    expect(result.industry).toBeUndefined();
  });

  it("preserves user-provided values over defaults", () => {
    const result = onboardingSchema.parse({
      company_name: "My Startup",
      stage: "Series A",
    });
    expect(result.stage).toBe("Series A");
    // Others should still get defaults
    expect(result.business_model).toBe("SaaS");
  });

  it("strips the retired scalar + detailed-array fields", () => {
    // The wizard now uses the real per-domain endpoints for these; the slim
    // schema drops them entirely (Zod strips unknown keys).
    const result = onboardingSchema.parse({
      company_name: "Acme Corp",
      monthly_revenue: "$50k",
      team_size: "5",
      funding: "$1m",
      main_expenses: "Salaries",
      revenue_streams: [{ name: "Pro" }],
      funding_rounds: [{ name: "Seed" }],
      headcount: [{ title: "Eng" }],
      expenses: [{ name: "AWS" }],
    }) as Record<string, unknown>;
    expect(result.monthly_revenue).toBeUndefined();
    expect(result.team_size).toBeUndefined();
    expect(result.funding).toBeUndefined();
    expect(result.main_expenses).toBeUndefined();
    expect(result.revenue_streams).toBeUndefined();
    expect(result.funding_rounds).toBeUndefined();
    expect(result.headcount).toBeUndefined();
    expect(result.expenses).toBeUndefined();
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
});
