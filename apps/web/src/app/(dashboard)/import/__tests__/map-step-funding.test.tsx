import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FundingMapStep } from "../map-step";
import type { FundingRoundColumnMapping, MappingConfidence, ParsedRow } from "../import-utils";

const zeroConfidence: MappingConfidence = {
  date: 0, amount: 0, description: 0, category: 0, vendor: 0, notes: 0, externalId: 0,
};

const headers = ["Round Name", "Type", "Amount Raised", "Signing Date", "Valuation Cap"];
const rows: ParsedRow[] = [
  { "Round Name": "Seed", Type: "seed", "Amount Raised": "1000000", "Signing Date": "2026-01-01" },
];

function renderFunding(mapping: FundingRoundColumnMapping, gen = vi.fn()) {
  return render(
    <FundingMapStep
      fileName="rounds.csv"
      rows={rows}
      headers={headers}
      mapping={mapping}
      setMapping={vi.fn()}
      mappingConfidence={zeroConfidence}
      loading={false}
      reset={vi.fn()}
      generatePreview={gen}
    />,
  );
}

const emptyMapping: FundingRoundColumnMapping = {
  target: "funding-rounds", name: "", roundType: "", amount: "", date: "",
};

describe("FundingMapStep (DATA-01)", () => {
  it("renders Round name and Round type selects", () => {
    renderFunding(emptyMapping);
    expect(screen.getByLabelText("Round name column")).toBeTruthy();
    expect(screen.getByLabelText("Round type column")).toBeTruthy();
    expect(screen.getByLabelText("Amount column")).toBeTruthy();
    expect(screen.getByLabelText("Date column")).toBeTruthy();
  });

  it("does NOT render an 'Import into account' select", () => {
    renderFunding(emptyMapping);
    expect(screen.queryByLabelText("Import into account")).toBeNull();
    expect(screen.queryByText(/Import into account/)).toBeNull();
  });

  it("disables Preview until name/roundType/amount/date are mapped", () => {
    renderFunding(emptyMapping);
    const btn = screen.getByRole("button", { name: /Preview Import/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("invokes generatePreview (no validation error) when required columns are mapped", () => {
    const gen = vi.fn();
    const mapped: FundingRoundColumnMapping = {
      target: "funding-rounds",
      name: "Round Name",
      roundType: "Type",
      amount: "Amount Raised",
      date: "Signing Date",
    };
    renderFunding(mapped, gen);
    const btn = screen.getByRole("button", { name: /Preview Import/ });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn);
    expect(gen).toHaveBeenCalledTimes(1);
  });
});
