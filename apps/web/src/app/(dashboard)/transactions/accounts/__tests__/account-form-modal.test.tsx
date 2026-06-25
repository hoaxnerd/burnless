import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccountFormModal } from "../account-form-modal";

const mockApiFetch = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/api-fetch", () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));
vi.mock("@/lib/api-error", () => ({ toUserMessage: (e: unknown) => String(e) }));

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ id: "acc-new" }) });
});

describe("AccountFormModal (add)", () => {
  it("renders name, type, category and coversHeadcount controls", () => {
    render(<AccountFormModal mode="add" />);
    fireEvent.click(screen.getByRole("button", { name: /add account/i }));
    expect(screen.getByLabelText(/name/i)).toBeTruthy();
    expect(screen.getByLabelText(/^type$/i)).toBeTruthy();
    expect(screen.getByLabelText(/category/i)).toBeTruthy();
    expect(screen.getByLabelText(/covers headcount/i)).toBeTruthy();
  });

  it("POSTs the account payload on submit", async () => {
    render(<AccountFormModal mode="add" />);
    fireEvent.click(screen.getByRole("button", { name: /add account/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Marketing" } });
    fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "expense" } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: "operating_expense" } });
    fireEvent.submit(screen.getByRole("form", { name: /add account/i }));
    await vi.waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    const [url, opts] = mockApiFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/accounts");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body).toMatchObject({ name: "Marketing", type: "expense", category: "operating_expense", coversHeadcount: false });
  });
});

describe("AccountFormModal (edit)", () => {
  it("PATCHes to the account id on submit", async () => {
    render(
      <AccountFormModal
        mode="edit"
        open
        onClose={vi.fn()}
        initialValue={{ id: "acc-1", name: "Revenue", type: "income", category: "revenue", coversHeadcount: false }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Revenue 2" } });
    fireEvent.submit(screen.getByRole("form", { name: /edit account/i }));
    await vi.waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    const [url, opts] = mockApiFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/accounts/acc-1");
    expect(opts.method).toBe("PATCH");
    expect(JSON.parse(opts.body as string).name).toBe("Revenue 2");
  });
});
