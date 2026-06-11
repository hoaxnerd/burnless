import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareClassFormFields } from "../share-class-form-fields";

describe("ShareClassFormFields (controlled)", () => {
  it("prefills from initial and calls onSubmit with values", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ShareClassFormFields initial={{ name: "Common", classType: "common", totalAuthorized: 8000000, totalIssued: 8000000 }} onSubmit={onSubmit} onCancel={() => {}} />);
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe("Common");
    fireEvent.click(screen.getByTestId("submit-share-class"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ name: "Common", classType: "common" });
  });
});
