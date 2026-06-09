import { vi, describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const refreshMock = vi.fn();
const confirmMock = vi.fn(() => Promise.resolve(true));
const toastErrorMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock("@/lib/api-fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ error: toastErrorMock, success: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/components/ui", () => ({
  Modal: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
  Input: ({ label, error, showOptional, hint, ...props }: { label?: string; error?: string; showOptional?: boolean; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <label>
      {label && <span>{label}</span>}
      <input aria-label={label || undefined} {...props} />
      {error && <span role="alert">{error}</span>}
    </label>
  ),
  useConfirm: () => ({ confirm: confirmMock, dialog: null }),
}));

import { ManageDepartmentsPanel } from "../manage-departments-panel";

const DEPTS = [
  { id: "org", name: "Engineering", parentId: null },
  { id: "sub", name: "Backend", parentId: "org" },
];

describe("<ManageDepartmentsPanel>", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshMock.mockClear();
    confirmMock.mockClear();
    toastErrorMock.mockClear();
  });

  it("renders the DepartmentTree inside the Manage-departments modal", () => {
    render(<ManageDepartmentsPanel departments={DEPTS} referencedDeptIds={new Set()} />);
    fireEvent.click(screen.getByTestId("open-manage-departments"));
    expect(screen.getByTestId("department-tree")).toBeTruthy();
    // Tree renders the department node button
    expect(screen.getByTestId("dept-org")).toBeTruthy();
    expect(screen.getByTestId("dept-org").textContent).toContain("Engineering");
  });

  it("onAddChild → POSTs to /api/departments with name+parentId, then refreshes", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    render(<ManageDepartmentsPanel departments={DEPTS} referencedDeptIds={new Set()} />);
    fireEvent.click(screen.getByTestId("open-manage-departments"));

    // Add a sub-department under "org" (level 2)
    fireEvent.click(screen.getByTestId("add-sub-org"));
    fireEvent.change(screen.getByTestId("add-department-name"), { target: { value: "Frontend" } });
    fireEvent.click(screen.getByTestId("submit-add-department"));
    await new Promise((r) => setTimeout(r, 0));

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = (apiFetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/departments");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Frontend", parentId: "org" });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("rename → PATCHes /api/departments/[id] then refreshes", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    render(<ManageDepartmentsPanel departments={DEPTS} referencedDeptIds={new Set()} />);
    fireEvent.click(screen.getByTestId("open-manage-departments"));

    fireEvent.click(screen.getByTestId("rename-dept-org"));
    fireEvent.change(screen.getByTestId("rename-input-org"), { target: { value: "Eng & Product" } });
    fireEvent.click(screen.getByTestId("submit-rename-org"));
    await new Promise((r) => setTimeout(r, 0));

    const [url, init] = (apiFetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/departments/org");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Eng & Product" });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("delete is DISABLED for departments with headcount references (no cascade destruction)", () => {
    render(<ManageDepartmentsPanel departments={DEPTS} referencedDeptIds={new Set(["org"])} />);
    fireEvent.click(screen.getByTestId("open-manage-departments"));
    expect((screen.getByTestId("delete-dept-org") as HTMLButtonElement).disabled).toBe(true);
    // an unreferenced dept stays deletable
    expect((screen.getByTestId("delete-dept-sub") as HTMLButtonElement).disabled).toBe(false);
  });

  it("delete (unreferenced) → confirm → DELETEs then refreshes", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    render(<ManageDepartmentsPanel departments={DEPTS} referencedDeptIds={new Set()} />);
    fireEvent.click(screen.getByTestId("open-manage-departments"));

    fireEvent.click(screen.getByTestId("delete-dept-sub"));
    await new Promise((r) => setTimeout(r, 0));

    expect(confirmMock).toHaveBeenCalled();
    const [url, init] = (apiFetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/departments/sub");
    expect(init.method).toBe("DELETE");
    expect(refreshMock).toHaveBeenCalled();
  });
});
