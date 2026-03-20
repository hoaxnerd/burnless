import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricCard } from "../metric-card";
import { DollarSign } from "lucide-react";

describe("MetricCard", () => {
  it("renders label and value", () => {
    render(<MetricCard label="Burn Rate" value="$12,500" />);
    expect(screen.getByText("Burn Rate")).toBeInTheDocument();
    expect(screen.getByText("$12,500")).toBeInTheDocument();
  });

  it("renders change text when provided", () => {
    render(<MetricCard label="Revenue" value="$50K" change="+12%" />);
    expect(screen.getByText("+12%")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<MetricCard label="Runway" value="14 months" description="vs last month" />);
    expect(screen.getByText("vs last month")).toBeInTheDocument();
  });

  it("renders description with separator when change is also present", () => {
    render(
      <MetricCard label="Revenue" value="$50K" change="+12%" description="vs last month" />
    );
    expect(screen.getByText(/· vs last month/)).toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    const { container } = render(
      <MetricCard label="Cash" value="$100K" icon={DollarSign} />
    );
    // Lucide icons render as SVG
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders skeleton when loading", () => {
    const { container } = render(<MetricCard label="Revenue" value="$0" loading />);
    expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThanOrEqual(1);
  });

  it("applies success variant border class", () => {
    const { container } = render(
      <MetricCard label="Revenue" value="$50K" variant="success" />
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("border-l-success-500");
  });

  it("applies danger variant border class", () => {
    const { container } = render(
      <MetricCard label="Burn" value="$30K" variant="danger" />
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("border-l-danger-500");
  });

  it("applies default variant class when no variant specified", () => {
    const { container } = render(<MetricCard label="Metric" value="42" />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("border-surface-200");
    expect(card.className).not.toContain("border-l-4");
  });

  it("applies success color to positive change text", () => {
    render(<MetricCard label="Revenue" value="$50K" change="+12%" />);
    const changeEl = screen.getByText("+12%");
    expect(changeEl.className).toContain("text-success-600");
  });

  it("applies danger color to negative change text", () => {
    render(<MetricCard label="Revenue" value="$50K" change="-5%" />);
    const changeEl = screen.getByText("-5%");
    expect(changeEl.className).toContain("text-danger-600");
  });

  it("renders trend icon for up trend", () => {
    render(<MetricCard label="Revenue" value="$50K" trend="up" change="+10%" />);
    const changeEl = screen.getByText("+10%");
    // The trend icon should be a sibling SVG
    expect(changeEl.parentElement?.querySelector("svg")).toBeInTheDocument();
  });

  it("renders trend icon for down trend", () => {
    render(<MetricCard label="Revenue" value="$50K" trend="down" change="-10%" />);
    const changeEl = screen.getByText("-10%");
    expect(changeEl.parentElement?.querySelector("svg")).toBeInTheDocument();
  });

  it("renders no change section when neither change nor description provided", () => {
    const { container } = render(<MetricCard label="Metric" value="42" />);
    // Only label and value elements, no change/description section
    const children = container.firstElementChild!.children;
    // Should have header row and value, but no change div
    expect(children.length).toBe(2);
  });
});
