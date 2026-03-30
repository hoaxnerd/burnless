import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricCardsGrid, type MetricCardConfig } from "../metric-cards-grid";
import { DollarSign } from "lucide-react";

const cards: MetricCardConfig[] = [
  { slug: "revenue", label: "Revenue", value: "$50K", icon: DollarSign },
  { slug: "burn", label: "Burn Rate", value: "$12K" },
];

describe("MetricCardsGrid", () => {
  it("renders all cards", () => {
    render(<MetricCardsGrid cards={cards} />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("Burn Rate")).toBeInTheDocument();
  });

  it("renders correct number of stagger wrappers", () => {
    const { container } = render(<MetricCardsGrid cards={cards} />);
    const staggerDivs = container.querySelectorAll("[class*='stagger-']");
    expect(staggerDivs.length).toBe(2);
  });

  it("applies custom gap class", () => {
    const { container } = render(<MetricCardsGrid cards={cards} gap={6} />);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toContain("gap-6");
  });

  it("defaults to gap-4", () => {
    const { container } = render(<MetricCardsGrid cards={cards} />);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toContain("gap-4");
  });
});
