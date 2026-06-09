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
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

import { OptionPoolForm } from "../option-pool-form";

describe("<OptionPoolForm>", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshMock.mockClear();
  });

  it("opens the modal when the add trigger is clicked", () => {
    render(<OptionPoolForm />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("open-add-option-pool"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("POSTs a valid payload, toasts, refreshes, and closes on success", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(<OptionPoolForm />);
    fireEvent.click(screen.getByTestId("open-add-option-pool"));

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "2024 Pool" } });
    fireEvent.change(screen.getByLabelText("Reserved shares"), { target: { value: "1000000" } });

    fireEvent.click(screen.getByTestId("submit-option-pool"));
    await new Promise((r) => setTimeout(r, 0));

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = (apiFetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/option-pools");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe("2024 Pool");
    expect(body.totalReserved).toBe(1000000);

    expect(toastSuccess).toHaveBeenCalled();
    expect(refreshMock).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("PATCHes to /api/option-pools/[id] when editing an existing pool", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(
      <OptionPoolForm
        existing={{ id: "op1", name: "Old Pool", totalReserved: "500000" }}
      />,
    );
    fireEvent.click(screen.getByTestId("open-add-option-pool"));
    fireEvent.change(screen.getByLabelText("Reserved shares"), { target: { value: "750000" } });

    fireEvent.click(screen.getByTestId("submit-option-pool"));
    await new Promise((r) => setTimeout(r, 0));

    const [url, init] = (apiFetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/option-pools/op1");
    expect(init.method).toBe("PATCH");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("surfaces the single-pool 409 cleanly via toast and keeps the modal open", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "Cap-table currently supports a single option pool.",
        code: "SINGLE_POOL_ONLY",
      }),
    });

    render(<OptionPoolForm />);
    fireEvent.click(screen.getByTestId("open-add-option-pool"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Second Pool" } });
    fireEvent.change(screen.getByLabelText("Reserved shares"), { target: { value: "100" } });

    fireEvent.click(screen.getByTestId("submit-option-pool"));
    await new Promise((r) => setTimeout(r, 0));

    expect(toastError).toHaveBeenCalledWith(
      expect.stringMatching(/single option pool/i),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
