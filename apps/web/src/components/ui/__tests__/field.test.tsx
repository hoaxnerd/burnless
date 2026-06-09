import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "../field";

describe("Field", () => {
  it("passes a generated id + null aria props to the control via render-prop", () => {
    render(
      <Field label="Email">
        {(a11y) => <input aria-label="email" {...a11y} />}
      </Field>,
    );
    const input = screen.getByLabelText("email");
    expect(input.id).toBeTruthy();
    // label wired to the same id
    expect(screen.getByText("Email").getAttribute("for")).toBe(input.id);
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("honors an explicit id", () => {
    render(
      <Field label="Name" id="custom-id">
        {(a11y) => <input aria-label="name" {...a11y} />}
      </Field>,
    );
    expect(screen.getByLabelText("name").id).toBe("custom-id");
  });

  it("renders required marker", () => {
    render(
      <Field label="Name" required>
        {(a11y) => <input aria-label="name" {...a11y} />}
      </Field>,
    );
    expect(screen.getByText("Name").textContent).toContain("*");
  });

  it("renders an optional marker when showOptional and not required", () => {
    render(
      <Field label="Notes" showOptional>
        {(a11y) => <input aria-label="notes" {...a11y} />}
      </Field>,
    );
    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("renders error with role=alert and wires aria-invalid + aria-describedby", () => {
    render(
      <Field label="Amount" id="amt" error="Required">
        {(a11y) => <input aria-label="amount" {...a11y} />}
      </Field>,
    );
    const input = screen.getByLabelText("amount");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("amt-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });

  it("renders hint (described-by) only when no error", () => {
    const { rerender } = render(
      <Field label="A" id="a" hint="helper">
        {(a11y) => <input aria-label="a" {...a11y} />}
      </Field>,
    );
    expect(screen.getByLabelText("a").getAttribute("aria-describedby")).toBe(
      "a-hint",
    );
    expect(screen.getByText("helper")).toBeInTheDocument();

    rerender(
      <Field label="A" id="a" hint="helper" error="bad">
        {(a11y) => <input aria-label="a" {...a11y} />}
      </Field>,
    );
    expect(screen.queryByText("helper")).not.toBeInTheDocument();
    expect(screen.getByLabelText("a").getAttribute("aria-describedby")).toBe(
      "a-error",
    );
  });
});
