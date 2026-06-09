/**
 * custom-formula-fields.test.tsx — Phase 4 §4.6
 *
 * <CustomFormulaFields> must:
 *  - surface the available line names a `custom_formula` expression may
 *    reference (datalist + visible hint), driven by an `availableLineNames` prop.
 *  - reject a STRING-valued variable: engine `CustomFormulaParams.variables` is
 *    `Record<string, number>`, so a string value is invalid and must NOT be
 *    committed to the parent — an inline error is shown instead.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CustomFormulaFields } from "../forecast-method-fields/CustomFormulaFields";

describe("<CustomFormulaFields> line names + numeric variables", () => {
  it("surfaces available line names from the availableLineNames prop", () => {
    render(
      <CustomFormulaFields
        params={{ expression: "" }}
        onChange={vi.fn()}
        availableLineNames={["CloudCosts", "Payroll"]}
      />,
    );

    // Names are surfaced to the user — both must appear in the rendered output.
    expect(screen.getByText(/CloudCosts/)).toBeTruthy();
    expect(screen.getByText(/Payroll/)).toBeTruthy();
  });

  it("rejects a string-valued variable (variables are numeric)", () => {
    const onChange = vi.fn();
    render(
      <CustomFormulaFields
        params={{ expression: "x + 1" }}
        onChange={onChange}
        availableLineNames={[]}
      />,
    );

    const textarea = screen.getByLabelText(/Variables/i);
    // A string value is invalid for Record<string, number>.
    fireEvent.change(textarea, { target: { value: '{ "x": "abc" }' } });
    fireEvent.blur(textarea);

    // Error surfaced; the invalid object is NOT committed to the parent.
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ variables: expect.anything() }),
    );
  });

  it("accepts a numeric variable and commits it", () => {
    const onChange = vi.fn();
    render(
      <CustomFormulaFields
        params={{ expression: "x + 1" }}
        onChange={onChange}
        availableLineNames={[]}
      />,
    );

    const textarea = screen.getByLabelText(/Variables/i);
    fireEvent.change(textarea, { target: { value: '{ "x": 5 }' } });
    fireEvent.blur(textarea);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { x: 5 } }),
    );
  });
});
