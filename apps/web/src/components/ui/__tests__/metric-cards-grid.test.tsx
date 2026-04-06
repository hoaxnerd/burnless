import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricCardsGrid, type MetricCardConfig } from "../metric-cards-grid";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("@/components/providers/metrics-context", () => ({
  useOptionalMetrics: () => null,
}));

vi.mock("@/components/providers/computed-metrics-context", () => ({
  useOptionalComputedMetrics: () => null,
}));

vi.mock("@/components/providers/page-context", () => ({
  usePageId: () => "test",
}));

const cards: MetricCardConfig[] = [
  { slug: "revenue", label: "Revenue", value: "$50K" },
  { slug: "burn", label: "Burn Rate", value: "$12K" },
];

describe("MetricCardsGrid", () => {
  it("renders all cards", () => {
    render(<MetricCardsGrid cards={cards} />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("Burn Rate")).toBeInTheDocument();
  });

  it("renders correct number of cards", () => {
    const { container } = render(<MetricCardsGrid cards={cards} />);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.children.length).toBe(2);
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
