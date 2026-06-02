import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/components/locale/locale-context";
import { GenerativeBlock } from "../generative-block";

// ChartCard → WidgetCard calls useRouter(); the app-router context isn't mounted
// in unit tests. Stub navigation (same pattern as line-chart.test.tsx).
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

describe("GenAreaChart via GenerativeBlock", () => {
  it("renders the chart card title for an area chart", () => {
    render(
      <LocaleProvider>
        <GenerativeBlock
          component="area_chart"
          props={{
            title: "Cash runway",
            format: "currency",
            data: [
              { month: "2026-05", value: 900000 },
              { month: "2026-06", value: 818000 },
            ],
          }}
        />
      </LocaleProvider>
    );
    expect(screen.getByRole("heading", { name: "Cash runway" })).toBeInTheDocument();
  });
});
