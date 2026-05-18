import { describe, it, expect } from "vitest";
import { autoMapColumns } from "../import-utils";

describe("autoMapColumns target=funding-rounds", () => {
  it("maps common Carta-export headers", () => {
    const { mapping } = autoMapColumns(
      ["Round Name", "Type", "Close Date", "Amount Raised", "Valuation Cap", "Discount"],
      { target: "funding-rounds" },
    );
    if (mapping.target !== "funding-rounds") throw new Error("wrong branch");
    expect(mapping.name).toBe("Round Name");
    expect(mapping.roundType).toBe("Type");
    expect(mapping.closeDate).toBe("Close Date");
    expect(mapping.amount).toBe("Amount Raised");
    expect(mapping.valuationCap).toBe("Valuation Cap");
    expect(mapping.discountRate).toBe("Discount");
  });

  it("defaults to transactions target when opts omitted (backwards compat)", () => {
    const { mapping } = autoMapColumns(["Date", "Amount", "Description"]);
    if (mapping.target !== undefined && mapping.target !== "transactions")
      throw new Error("default branch broken");
    // ColumnMapping has date as a plain string field
    expect((mapping as { date: string }).date).toBe("Date");
  });

  it("returns zero-filled transaction-shaped confidence for funding branch", () => {
    // Use explicit date + amount headers that match the funding patterns
    const { confidence } = autoMapColumns(
      ["Round Name", "Type", "Signing Date", "Amount Raised"],
      { target: "funding-rounds" },
    );
    expect(confidence.description).toBe(0);
    expect(confidence.category).toBe(0);
    expect(confidence.vendor).toBe(0);
    expect(confidence.externalId).toBe(0);
    // date and amount come from matched headers, so they should be > 0
    expect(confidence.date).toBeGreaterThan(0);
    expect(confidence.amount).toBeGreaterThan(0);
  });

  it("handles missing optional fields gracefully", () => {
    const { mapping } = autoMapColumns(
      ["Round Name", "Stage", "Amount Raised", "Signing Date"],
      { target: "funding-rounds" },
    );
    if (mapping.target !== "funding-rounds") throw new Error("wrong branch");
    expect(mapping.name).toBe("Round Name");
    expect(mapping.roundType).toBe("Stage");
    expect(mapping.amount).toBe("Amount Raised");
    expect(mapping.date).toBe("Signing Date");
    expect(mapping.closeDate).toBeUndefined();
    expect(mapping.valuationCap).toBeUndefined();
  });
});
