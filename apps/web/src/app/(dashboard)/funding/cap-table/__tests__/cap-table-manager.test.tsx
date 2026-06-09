/**
 * U4 — cap-table-manager: a "Manage" section with editable share-class +
 * option-pool tables. Delete flows through the themed <ConfirmDialog> (NEVER a
 * native window.confirm) → apiFetch DELETE → router.refresh(). The "Add option
 * pool" affordance is disabled when a non-deleted pool already exists
 * (single-pool guard, Phase 3 F §F5). Cap-table is currency-agnostic — share
 * counts only, no currency formatting.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const apiFetch = vi.fn(async () => ({
  ok: true,
  json: async () => ({}),
}));
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...(args as [])),
}));

import { LocaleProvider } from "@/components/locale/locale-context";
import { ToastProvider } from "@/components/ui/toast";
import { CapTableManager } from "../cap-table-manager";
import type { ShareClassRow, OptionPoolRow } from "../cap-table-view";

function wrap(ui: React.ReactNode) {
  return (
    <LocaleProvider>
      <ToastProvider>{ui}</ToastProvider>
    </LocaleProvider>
  );
}

const shareClass: ShareClassRow = {
  id: "sc-1",
  name: "Series A Preferred",
  classType: "preferred",
  totalAuthorized: "1000000",
  totalIssued: "500000",
  liquidationPreference: "1",
};

const optionPool: OptionPoolRow = {
  id: "op-1",
  name: "2024 Plan",
  totalReserved: "200000",
};

describe("CapTableManager (U4)", () => {
  beforeEach(() => {
    refresh.mockClear();
    apiFetch.mockClear();
  });

  it("renders a row per share class and option pool with stable testids", () => {
    render(
      wrap(
        <CapTableManager shareClasses={[shareClass]} optionPools={[optionPool]} />,
      ),
    );

    expect(screen.getByTestId("share-class-sc-1")).toBeInTheDocument();
    expect(screen.getByText("Series A Preferred")).toBeInTheDocument();
    expect(screen.getByTestId("option-pool-op-1")).toBeInTheDocument();
    expect(screen.getByText("2024 Plan")).toBeInTheDocument();
  });

  it("deleting a share class opens a themed ConfirmDialog (not native) then DELETEs via apiFetch + refreshes", async () => {
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal("confirm", nativeConfirm);

    render(
      wrap(
        <CapTableManager shareClasses={[shareClass]} optionPools={[]} />,
      ),
    );

    fireEvent.click(screen.getByTestId("delete-share-class-sc-1"));

    // Themed dialog renders — native confirm is never used.
    expect(nativeConfirm).not.toHaveBeenCalled();
    const confirmBtn = await screen.findByRole("button", { name: /^delete$/i });

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/share-classes/sc-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());

    vi.unstubAllGlobals();
  });

  it("deleting an option pool DELETEs the option-pool route via apiFetch", async () => {
    render(
      wrap(
        <CapTableManager shareClasses={[]} optionPools={[optionPool]} />,
      ),
    );

    fireEvent.click(screen.getByTestId("delete-option-pool-op-1"));
    const confirmBtn = await screen.findByRole("button", { name: /^delete$/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/option-pools/op-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("hides the toolbar Add option pool affordance when a pool already exists (single-pool guard)", () => {
    render(
      wrap(
        <CapTableManager shareClasses={[]} optionPools={[optionPool]} />,
      ),
    );

    // The toolbar must not offer adding a SECOND pool. (The row still carries an
    // Edit affordance — scope the assertion to the toolbar region.)
    const toolbar = screen.getByTestId("cap-table-toolbar");
    expect(
      within(toolbar).queryByTestId("open-add-option-pool"),
    ).not.toBeInTheDocument();
  });

  it("shows the toolbar Add option pool affordance when no pool exists", () => {
    render(
      wrap(<CapTableManager shareClasses={[]} optionPools={[]} />),
    );

    const toolbar = screen.getByTestId("cap-table-toolbar");
    expect(
      within(toolbar).getByTestId("open-add-option-pool"),
    ).toBeInTheDocument();
  });
});
