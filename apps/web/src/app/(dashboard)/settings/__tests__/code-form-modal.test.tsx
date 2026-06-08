import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
}));

import { CodeFormModal } from "../code-form-modal";
import { defaultForm } from "../invite-codes-types";

describe("CodeFormModal — SET-10 default Single Use", () => {
  it("defaultForm defaults to single_use with maxRedemptions 1", () => {
    expect(defaultForm.type).toBe("single_use");
    expect(defaultForm.maxRedemptions).toBe(1);
  });

  it("renders with Single Use selected and Max Redemptions hidden by default", () => {
    render(
      <CodeFormModal
        open
        onClose={() => {}}
        onSubmit={() => {}}
        initial={defaultForm}
        mode="create"
        saving={false}
        error={null}
      />
    );

    // Both toggle options present
    expect(screen.getByText("Single Use")).toBeTruthy();
    expect(screen.getByText("Multi Use")).toBeTruthy();

    // Max Redemptions field is hidden for single_use (only shown for multi_use)
    expect(screen.queryByText("Max Redemptions")).toBeNull();
  });
});
