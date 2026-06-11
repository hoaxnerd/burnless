import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HeadcountFormBody } from "../headcount-form-body";

const depts = [{ id: "d1", name: "Engineering" }];

describe("HeadcountFormBody (controlled, no modal)", () => {
  it("renders fields inline and calls onSubmit with a normalized payload", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<HeadcountFormBody departments={depts} onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Engineer" } });
    // full_time requires a positive salary to pass validateHeadcountForm
    fireEvent.change(screen.getByLabelText(/annual salary/i), { target: { value: "100000" } });
    fireEvent.click(screen.getByTestId("save-headcount"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]![0]).toHaveProperty("title", "Engineer");
  });
});
