import { vi, describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const refreshMock = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock("@/lib/api-fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("@/components/ui", () => ({
  Modal: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
  Input: ({ label, error, ...props }: { label?: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <label>
      {label && <span>{label}</span>}
      <input aria-label={label} {...props} />
      {error && <span role="alert">{error}</span>}
    </label>
  ),
  Select: ({ label, error, children, ...props }: { label?: string; error?: string; children?: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <label>
      {label && <span>{label}</span>}
      <select aria-label={label} {...props}>{children}</select>
      {error && <span role="alert">{error}</span>}
    </label>
  ),
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  IconButton: ({ icon, ...props }: { icon?: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{icon}</button>
  ),
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

import { ShareClassForm } from "../share-class-form";

describe("<ShareClassForm>", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshMock.mockClear();
  });

  it("opens the modal when the add trigger is clicked", () => {
    render(<ShareClassForm />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("open-add-share-class"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("rejects totalIssued > totalAuthorized with an inline error and no network", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");

    render(<ShareClassForm />);
    fireEvent.click(screen.getByTestId("open-add-share-class"));

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Series A Preferred" } });
    fireEvent.change(screen.getByLabelText("Authorized shares"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Issued shares"), { target: { value: "2000" } });

    fireEvent.click(screen.getByTestId("submit-share-class"));
    await new Promise((r) => setTimeout(r, 0));

    const alerts = screen.getAllByRole("alert");
    expect(
      alerts.some((a) => /cannot exceed/i.test(a.textContent ?? "")),
    ).toBe(true);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("POSTs a valid payload, toasts, refreshes, and closes on success", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(<ShareClassForm />);
    fireEvent.click(screen.getByTestId("open-add-share-class"));

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Series A Preferred" } });
    fireEvent.change(screen.getByLabelText("Class type"), { target: { value: "preferred" } });
    fireEvent.change(screen.getByLabelText("Authorized shares"), { target: { value: "1000000" } });
    fireEvent.change(screen.getByLabelText("Issued shares"), { target: { value: "500000" } });
    fireEvent.change(screen.getByLabelText("Liquidation preference"), { target: { value: "1" } });

    fireEvent.click(screen.getByTestId("submit-share-class"));
    await new Promise((r) => setTimeout(r, 0));

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = (apiFetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/share-classes");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe("Series A Preferred");
    expect(body.classType).toBe("preferred");
    expect(body.totalAuthorized).toBe(1000000);
    expect(body.totalIssued).toBe(500000);
    expect(body.liquidationPreference).toBe(1);

    expect(toastSuccess).toHaveBeenCalled();
    expect(refreshMock).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("PATCHes to /api/share-classes/[id] when editing an existing class", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(
      <ShareClassForm
        existing={{
          id: "sc1",
          name: "Common",
          classType: "common",
          totalAuthorized: "1000",
          totalIssued: "800",
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("open-add-share-class"));
    fireEvent.change(screen.getByLabelText("Issued shares"), { target: { value: "900" } });

    fireEvent.click(screen.getByTestId("submit-share-class"));
    await new Promise((r) => setTimeout(r, 0));

    const [url, init] = (apiFetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/share-classes/sc1");
    expect(init.method).toBe("PATCH");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("surfaces a server error via toast and keeps the modal open", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "boom" }),
    });

    render(<ShareClassForm />);
    fireEvent.click(screen.getByTestId("open-add-share-class"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Authorized shares"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Issued shares"), { target: { value: "50" } });

    fireEvent.click(screen.getByTestId("submit-share-class"));
    await new Promise((r) => setTimeout(r, 0));

    expect(toastError).toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
