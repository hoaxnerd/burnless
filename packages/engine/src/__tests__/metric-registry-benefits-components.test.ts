import { describe, expect, it } from "vitest";
import { getMetricChildren, getMetricDef } from "../metric-registry";

describe("totalEmployerBenefitsCost components", () => {
  it("parent metric exists", () => {
    expect(getMetricDef("totalEmployerBenefitsCost")).toBeDefined();
  });

  it("has all four generic components linked", () => {
    const slugs = getMetricChildren("totalEmployerBenefitsCost")
      .map((m) => m.slug)
      .sort();
    expect(slugs).toEqual([
      "insuranceBenefitsCost",
      "otherBenefitsCost",
      "retirementContributionsCost",
      "statutoryEmployerContributionsCost",
    ]);
  });

  it("descriptions are country-agnostic (multiple jurisdictions named)", () => {
    const statutory = getMetricDef("statutoryEmployerContributionsCost");
    expect(statutory).toBeDefined();
    // The description names multiple jurisdictions, not just one
    expect(statutory!.description.toLowerCase()).toMatch(/fica|ni|epf|super/);
  });
});
