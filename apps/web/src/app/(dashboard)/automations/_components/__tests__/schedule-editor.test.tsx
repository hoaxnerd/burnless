import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScheduleEditor } from "../schedule-editor";

describe("ScheduleEditor", () => {
  it("emits a cron when the preset/time changes", () => {
    const onChange = vi.fn();
    render(<ScheduleEditor value="0 9 * * 1" onChange={onChange} />);
    // change to daily preset → emits a daily cron
    fireEvent.change(screen.getByLabelText(/frequency/i), { target: { value: "daily" } });
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d+ \d+ \* \* \*$/));
  });

  it("shows a raw cron field in Custom mode", () => {
    render(<ScheduleEditor value="*/5 * * * *" onChange={() => {}} />);
    expect(screen.getByDisplayValue("*/5 * * * *")).toBeTruthy();
  });

  it("emits the raw cron when the Custom field is edited", () => {
    const onChange = vi.fn();
    render(<ScheduleEditor value="*/5 * * * *" onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue("*/5 * * * *"), {
      target: { value: "*/10 * * * *" },
    });
    expect(onChange).toHaveBeenCalledWith("*/10 * * * *");
  });

  it("shows a weekday select for a weekly cron", () => {
    render(<ScheduleEditor value="0 9 * * 1" onChange={() => {}} />);
    expect(screen.getByLabelText(/day of week/i)).toBeTruthy();
  });

  it("shows a day-of-month select for a monthly cron", () => {
    render(<ScheduleEditor value="0 7 1 * *" onChange={() => {}} />);
    expect(screen.getByLabelText(/day of month/i)).toBeTruthy();
  });
});
