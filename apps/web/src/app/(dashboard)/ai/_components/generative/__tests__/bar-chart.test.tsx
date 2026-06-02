import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/components/locale/locale-context";
import { GenerativeBlock } from "../generative-block";

// ChartCard → WidgetCard calls useRouter(); stub navigation (same as line-chart test).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

// Recharts' ResponsiveContainer needs a measured parent; happy-dom reports 0×0,
// so stub it to a fixed size. We only assert the card chrome renders.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 300 }}>{children}</div>
    ),
  };
});

describe("GenBarChart via GenerativeBlock", () => {
  it("renders the chart card title for a category bar chart", () => {
    render(
      <LocaleProvider>
        <GenerativeBlock
          component="bar_chart"
          props={{
            title: "Expenses by category",
            format: "currency",
            data: [
              { label: "Payroll", value: 90000 },
              { label: "Marketing", value: 25000 },
            ],
            bars: [{ dataKey: "value", label: "Amount", color: "#2563eb" }],
          }}
        />
      </LocaleProvider>
    );
    expect(
      screen.getByRole("heading", { name: "Expenses by category" })
    ).toBeInTheDocument();
  });
});
