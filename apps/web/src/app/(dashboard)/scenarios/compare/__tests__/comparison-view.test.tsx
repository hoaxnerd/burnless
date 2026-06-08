/**
 * SCN-07 — ComparisonView syncs the selected (base, compare) pair into the URL.
 *
 * The component holds baseId/compareId in state seeded from initialIds but never
 * wrote them back to the URL, so refresh/share lost the chosen pair. We assert
 * router.replace is called with ?ids=base,compare when both ids are set, with
 * { scroll: false }. URL query only — no cookie / X-Scenario-Id involvement.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

/* ── Mocks ──────────────────────────────────────────────────────────────── */

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// SWR layer — no actual fetching; nulls the comparison so the render is light.
vi.mock("@/lib/swr", () => ({
  useScenarioComparison: () => ({
    data: undefined,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  }),
  revalidateOnFinancialMutation: () => () => {},
  KEYS: { scenarioComparison: (a: string, b: string) => `cmp:${a}:${b}` },
}));

// Charts pull in recharts — stub to keep the test fast and DOM-free.
vi.mock("@/components/charts", () => ({
  MultiLineChart: () => null,
  VarianceBarChart: () => null,
  chartColors: { brand: "#000", warning: "#f00" },
}));

import { ComparisonView } from "../comparison-view";

const scenarios = [
  { id: "scn-A", name: "Bull", source: "manual" },
  { id: "scn-B", name: "Bear", source: "manual" },
];

describe("ComparisonView — SCN-07 URL sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes the selected pair back to the URL via router.replace when both ids are set", () => {
    render(
      <ComparisonView
        scenarios={scenarios}
        initialIds={["base", "scn-B"]}
        currency="USD"
      />,
    );

    expect(mockReplace).toHaveBeenCalledWith(
      "/scenarios/compare?ids=base,scn-B",
      { scroll: false },
    );
  });

  it("does NOT write the URL when only one id is set", () => {
    render(
      <ComparisonView
        scenarios={scenarios}
        initialIds={["base"]}
        currency="USD"
      />,
    );

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
