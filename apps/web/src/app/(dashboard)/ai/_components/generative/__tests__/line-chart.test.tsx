import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/components/locale/locale-context";
import { GenerativeBlock } from "../generative-block";

// ChartCard → WidgetCard calls useRouter(); the app-router context isn't mounted
// in unit tests. Stub navigation (same pattern as metric-cards-grid.test.tsx).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

// Recharts' ResponsiveContainer needs a measured (non-zero) parent; happy-dom
// reports 0×0, so stub it to render children at a fixed size. We only assert
// the card chrome (title) renders, not the SVG geometry.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 300 }}>{children}</div>
    ),
  };
});

describe("GenLineChart via GenerativeBlock", () => {
  it("renders the chart card title and line label", () => {
    render(
      <LocaleProvider>
        <GenerativeBlock
          component="line_chart"
          props={{
            title: "Revenue",
            format: "currency",
            data: [
              { month: "2026-05", value: 48000 },
              { month: "2026-06", value: 50000 },
            ],
            lines: [{ dataKey: "value", label: "Revenue" }],
          }}
        />
      </LocaleProvider>
    );
    // Card title from ChartCard.
    expect(screen.getByRole("heading", { name: "Revenue" })).toBeInTheDocument();
    // Inline legend label from MultiLineChart.
    expect(screen.getAllByText("Revenue").length).toBeGreaterThan(0);
  });
});
