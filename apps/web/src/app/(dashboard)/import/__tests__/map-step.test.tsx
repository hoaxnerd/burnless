import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapStep } from "../map-step";
import { pluralize } from "../import-utils";
import type { ColumnMapping, MappingConfidence, ParsedRow, AccountOption } from "../import-utils";

const zeroConfidence: MappingConfidence = {
  date: 0, amount: 0, description: 0, category: 0, vendor: 0, notes: 0, externalId: 0,
};

const baseMapping: ColumnMapping = { date: "", amount: "", description: "", category: "" };

function renderMapStep(rows: ParsedRow[], headers: string[]) {
  const accounts: AccountOption[] = [{ id: "a", name: "Bank", type: "asset", category: "cash" }];
  return render(
    <MapStep
      fileName="data.csv"
      rows={rows}
      headers={headers}
      mapping={baseMapping}
      setMapping={vi.fn()}
      mappingConfidence={zeroConfidence}
      setMappingConfidence={vi.fn()}
      targetAccountId=""
      setTargetAccountId={vi.fn()}
      accounts={accounts}
      loading={false}
      reset={vi.fn()}
      generatePreview={vi.fn()}
    />,
  );
}

describe("pluralize helper (DATA-06)", () => {
  it("returns singular for 1", () => {
    expect(pluralize(1, "row")).toBe("row");
    expect(pluralize(1, "column")).toBe("column");
  });
  it("returns plural for 0 and >1", () => {
    expect(pluralize(0, "row")).toBe("rows");
    expect(pluralize(2, "column")).toBe("columns");
  });
  it("honors a custom plural form", () => {
    expect(pluralize(2, "entry", "entries")).toBe("entries");
  });
});

describe("MapStep row/column count pluralization (DATA-06)", () => {
  // The count line splits across text nodes ("{n}", " ", "row"); match the
  // element's normalized textContent instead of a single text node.
  const matchLine = (re: RegExp) => (_: string, el: Element | null) =>
    !!el && el.tagName === "P" && re.test(el.textContent?.replace(/\s+/g, " ") ?? "");

  it("renders '1 row · 1 column detected' for a single-row, single-column file", () => {
    renderMapStep([{ Date: "2026-01-01" }], ["Date"]);
    expect(screen.getByText(matchLine(/1 row · 1 column detected/))).toBeTruthy();
    expect(screen.queryByText(matchLine(/1 rows/))).toBeNull();
    expect(screen.queryByText(matchLine(/1 columns/))).toBeNull();
  });

  it("renders plural for multiple rows/columns", () => {
    renderMapStep(
      [{ Date: "a", Amount: "1" }, { Date: "b", Amount: "2" }],
      ["Date", "Amount"],
    );
    expect(screen.getByText(matchLine(/2 rows · 2 columns detected/))).toBeTruthy();
  });
});
