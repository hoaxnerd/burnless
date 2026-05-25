import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import {
  VestingScheduleEditor,
  type VestingMilestone,
} from "../vesting-schedule-editor";

// Primitives use aria-label; no locale dependency in NumberInput/SingleDateInput.

function Wrapper({
  initial = [],
  totalShares,
}: {
  initial?: VestingMilestone[];
  totalShares?: number;
}) {
  const [value, setValue] = useState<VestingMilestone[]>(initial);
  return (
    <VestingScheduleEditor
      value={value}
      onChange={setValue}
      totalShares={totalShares}
    />
  );
}

describe("<VestingScheduleEditor>", () => {
  it("renders rows", () => {
    render(
      <Wrapper
        initial={[
          { type: "cliff", date: "2026-01-01", sharesVested: 100 },
          { type: "monthly", date: "2026-02-01", sharesVested: 50 },
        ]}
      />,
    );
    expect(screen.getByTestId("vesting-row-0")).toBeTruthy();
    expect(screen.getByTestId("vesting-row-1")).toBeTruthy();
  });

  it("adds rows and sorts ascending by date", () => {
    render(<Wrapper />);
    // Add a 2026-06 entry first
    fireEvent.change(screen.getByLabelText("Vesting date"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(screen.getByLabelText("Shares vested"), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByTestId("add-vesting"));

    // Then a 2026-01 entry
    fireEvent.change(screen.getByLabelText("Vesting date"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Shares vested"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByTestId("add-vesting"));

    const row0 = screen.getByTestId("vesting-row-0");
    const row1 = screen.getByTestId("vesting-row-1");
    expect(row0.textContent).toContain("2026-01-01");
    expect(row1.textContent).toContain("2026-06-01");
  });

  it("removes a row", () => {
    render(
      <Wrapper
        initial={[
          { type: "cliff", date: "2026-01-01", sharesVested: 100 },
          { type: "monthly", date: "2026-02-01", sharesVested: 50 },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("remove-vesting-0"));
    expect(screen.queryByTestId("vesting-row-1")).toBeNull();
    expect(screen.getByTestId("vesting-row-0").textContent).toContain("2026-02-01");
  });

  it("displays total when totalShares provided", () => {
    render(
      <Wrapper
        totalShares={1000}
        initial={[
          { type: "cliff", date: "2026-01-01", sharesVested: 100 },
          { type: "monthly", date: "2026-02-01", sharesVested: 50 },
        ]}
      />,
    );
    const total = screen.getByTestId("vesting-total");
    expect(total.textContent).toContain("150");
    expect(total.textContent).toContain("1000");
    expect(total.textContent).not.toContain("exceeds");
  });

  it("shows exceeds warning when total > totalShares", () => {
    render(
      <Wrapper
        totalShares={100}
        initial={[
          { type: "cliff", date: "2026-01-01", sharesVested: 80 },
          { type: "monthly", date: "2026-02-01", sharesVested: 50 },
        ]}
      />,
    );
    expect(screen.getByTestId("vesting-total").textContent).toContain("exceeds");
  });
});
