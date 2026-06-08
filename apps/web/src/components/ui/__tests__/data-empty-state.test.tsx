import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataEmptyState, isEmpty } from "../data-empty-state";

describe("DataEmptyState", () => {
  it("renders title and body", () => {
    render(<DataEmptyState title="No invoices" body="Add your first invoice" />);
    expect(screen.getByText("No invoices")).toBeInTheDocument();
    expect(screen.getByText("Add your first invoice")).toBeInTheDocument();
  });

  it("renders an action node", () => {
    render(
      <DataEmptyState title="Empty" action={<button>Add row</button>} />,
    );
    expect(screen.getByRole("button", { name: "Add row" })).toBeInTheDocument();
  });

  it("renders a compact variant", () => {
    const { container } = render(
      <DataEmptyState title="Empty" compact />,
    );
    expect(container.firstChild).toHaveClass("flex");
    expect(screen.getByText("Empty")).toBeInTheDocument();
  });
});

describe("isEmpty", () => {
  it("is true for null/undefined/empty array/empty string/empty object", () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
    expect(isEmpty([])).toBe(true);
    expect(isEmpty("  ")).toBe(true);
    expect(isEmpty({})).toBe(true);
  });

  it("is false for non-empty values", () => {
    expect(isEmpty([1])).toBe(false);
    expect(isEmpty("x")).toBe(false);
    expect(isEmpty({ a: 1 })).toBe(false);
    expect(isEmpty(0)).toBe(false);
  });
});
