import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CardCatalogProvider, useCardCatalog, useOptionalCardCatalog } from "../card-catalog-context";

function TestOptional() {
  const catalog = useOptionalCardCatalog();
  return <div data-testid="has-catalog">{catalog ? "yes" : "no"}</div>;
}

function TestRequired() {
  const catalog = useCardCatalog();
  return <div data-testid="registry-count">{catalog.registry.length}</div>;
}

const mockCatalog = {
  registry: [{ slug: "mrr", name: "MRR", description: "Monthly Recurring Revenue", formula: "sum(revenue)", category: "saas", tier: "core" }],
  usedSlugs: new Set<string>(["mrr"]),
  heroSlugs: [] as string[],
  onSelect: vi.fn(),
  onRemove: vi.fn(),
  onViewFormula: vi.fn(),
  categoryMeta: { saas: { label: "SaaS" } },
  getDependencyTree: () => [] as string[],
  getDependents: () => [] as string[],
  getMetricDef: () => undefined,
  swapMode: false,
  cardType: "metric" as const,
};

describe("CardCatalogContext", () => {
  it("useOptionalCardCatalog returns null outside provider", () => {
    render(<TestOptional />);
    expect(screen.getByTestId("has-catalog").textContent).toBe("no");
  });

  it("provides catalog to children", () => {
    render(
      <CardCatalogProvider value={mockCatalog}>
        <TestRequired />
      </CardCatalogProvider>
    );
    expect(screen.getByTestId("registry-count").textContent).toBe("1");
  });

  it("useCardCatalog throws outside provider", () => {
    expect(() => render(<TestRequired />)).toThrow(
      "useCardCatalog must be used within a CardCatalogProvider"
    );
  });
});
