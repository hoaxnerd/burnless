import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/api-fetch", () => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/swr", () => ({
  useSecurityStatus: () => ({ data: { enabled: false }, error: undefined, isLoading: false }),
  revalidate: vi.fn(),
  KEYS: { twoFactorStatus: "twoFactorStatus" },
}));

import { SecurityTab } from "../security-tab";

describe("SecurityTab — SET-08 change-password card", () => {
  it("renders the change-password card with 3 fields and a submit button", () => {
    render(<SecurityTab />);

    expect(screen.getByText("Change Password")).toBeTruthy();
    expect(screen.getByLabelText("Current password")).toBeTruthy();
    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm new password")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /change password/i })
    ).toBeTruthy();
  });
});
