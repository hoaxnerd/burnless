import { describe, expect, it } from "vitest";
import { getMetricChildren, getMetricDef } from "../metric-registry";

describe("totalRevenue components", () => {
  it("has all seven stream-type components linked", () => {
    const children = getMetricChildren("totalRevenue").map((m) => m.slug).sort();
    expect(children).toEqual(
      [
        "subscriptionRevenue",
        "oneTimeRevenue",
        "usageRevenue",
        "servicesRevenue",
        "marketplaceRevenue",
        "ecommerceRevenue",
        "hardwareRevenue",
      ].sort(),
    );
  });

  it("each component declares parentMetricId='totalRevenue' and category='revenue'", () => {
    for (const slug of [
      "subscriptionRevenue",
      "oneTimeRevenue",
      "usageRevenue",
      "servicesRevenue",
      "marketplaceRevenue",
      "ecommerceRevenue",
      "hardwareRevenue",
    ]) {
      const m = getMetricDef(slug);
      expect(m, `metric ${slug} missing`).toBeDefined();
      expect(m!.parentMetricId).toBe("totalRevenue");
      expect(m!.category).toBe("revenue");
      expect(m!.format).toBe("currency");
    }
  });
});
