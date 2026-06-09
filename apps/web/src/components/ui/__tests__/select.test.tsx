import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Select } from "../select";

const options = (
  <>
    <option value="a">Alpha</option>
    <option value="b">Beta</option>
  </>
);

describe("Select", () => {
  it("renders options and the canonical control style", () => {
    render(
      <Select label="Pick" defaultValue="a">
        {options}
      </Select>,
    );
    const select = screen.getByLabelText("Pick");
    expect(select.tagName).toBe("SELECT");
    expect(select.className).toContain("rounded-xl");
    expect(select.className).toContain("appearance-none");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("wires htmlFor↔id via Field", () => {
    render(<Select label="Pick">{options}</Select>);
    const select = screen.getByLabelText("Pick");
    expect(screen.getByText("Pick").getAttribute("for")).toBe(select.id);
  });

  it("applies disabled styling when disabled", () => {
    render(
      <Select label="Pick" disabled>
        {options}
      </Select>,
    );
    const select = screen.getByLabelText("Pick");
    expect(select).toBeDisabled();
    expect(select.className).toContain("disabled:opacity-60");
  });

  it("sets aria-invalid + danger border on error", () => {
    render(
      <Select label="Pick" error="Choose one">
        {options}
      </Select>,
    );
    const select = screen.getByLabelText("Pick");
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(select.className).toContain("border-danger-500");
    expect(screen.getByRole("alert")).toHaveTextContent("Choose one");
  });

  it("forwards onChange", () => {
    const onChange = vi.fn();
    render(
      <Select label="Pick" value="a" onChange={onChange}>
        {options}
      </Select>,
    );
    fireEvent.change(screen.getByLabelText("Pick"), { target: { value: "b" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("renders bare (no label) for inline use", () => {
    render(
      <Select aria-label="Inline" defaultValue="a">
        {options}
      </Select>,
    );
    expect(screen.getByLabelText("Inline").tagName).toBe("SELECT");
  });
});
