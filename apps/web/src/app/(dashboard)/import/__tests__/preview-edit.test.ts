import { describe, it, expect } from "vitest";
import { applyPreviewRowEdit } from "../import-utils";
import type { PreviewTransaction } from "../import-utils";

function makeRow(partial: Partial<PreviewTransaction> = {}): PreviewTransaction {
  return {
    date: "2026-01-01T00:00:00.000Z",
    amount: 100,
    description: "Office supplies",
    accountId: "acc-1",
    externalId: "ext-1",
    _edited: false,
    _excluded: false,
    ...partial,
  };
}

describe("applyPreviewRowEdit — DATA-03 spurious Edited flag", () => {
  it("does NOT set _edited when the amount is unchanged (no-op blur)", () => {
    const row = makeRow({ amount: 100 });
    const out = applyPreviewRowEdit(row, "amount", "100");
    expect(out).toBe(row); // same reference → React bails, no Edited flag
    expect(out._edited).toBe(false);
  });

  it("does NOT set _edited when the description is unchanged", () => {
    const row = makeRow({ description: "Office supplies" });
    const out = applyPreviewRowEdit(row, "description", "Office supplies");
    expect(out).toBe(row);
    expect(out._edited).toBe(false);
  });

  it("treats null description as '' so blurring an empty field is a no-op", () => {
    const row = makeRow({ description: null });
    const out = applyPreviewRowEdit(row, "description", "");
    expect(out).toBe(row);
    expect(out._edited).toBe(false);
  });

  it("ignores a NaN amount (no change, no flag)", () => {
    const row = makeRow({ amount: 100 });
    const out = applyPreviewRowEdit(row, "amount", "not-a-number");
    expect(out).toBe(row);
    expect(out._edited).toBe(false);
  });

  it("DOES set _edited and the new value on a real amount change", () => {
    const row = makeRow({ amount: 100 });
    const out = applyPreviewRowEdit(row, "amount", "250.5");
    expect(out).not.toBe(row);
    expect(out.amount).toBe(250.5);
    expect(out._edited).toBe(true);
  });

  it("DOES set _edited on a real description change", () => {
    const row = makeRow({ description: "Office supplies" });
    const out = applyPreviewRowEdit(row, "description", "Rent");
    expect(out).not.toBe(row);
    expect(out.description).toBe("Rent");
    expect(out._edited).toBe(true);
  });
});

describe("applyPreviewRowEdit — DATA-08 category override", () => {
  it("carries a category override and marks the row edited", () => {
    const row = makeRow({ suggestedCategory: "Software & Tools" });
    const out = applyPreviewRowEdit(row, "category", "Marketing");
    expect(out).not.toBe(row);
    expect(out.categoryOverride).toBe("Marketing");
    expect(out._edited).toBe(true);
  });

  it("is a no-op when the override equals the AI suggestion", () => {
    const row = makeRow({ suggestedCategory: "Software & Tools" });
    const out = applyPreviewRowEdit(row, "category", "Software & Tools");
    expect(out).toBe(row);
    expect(out._edited).toBe(false);
  });

  it("clears the override when set to empty string", () => {
    const row = makeRow({ suggestedCategory: "Software & Tools", categoryOverride: "Marketing" });
    const out = applyPreviewRowEdit(row, "category", "");
    expect(out.categoryOverride).toBeUndefined();
    expect(out._edited).toBe(true);
  });
});
