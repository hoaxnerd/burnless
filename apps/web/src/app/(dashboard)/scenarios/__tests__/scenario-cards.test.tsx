/**
 * SCN-01 + SCN-03 — ScenarioCards component tests
 *
 * SCN-01: deleting the ACTIVE scenario calls exitScenario() (not router.refresh directly).
 *         deleting a NON-active scenario calls router.refresh(), not exitScenario.
 *
 * SCN-03: "Rename" item opens modal; submitting a changed name calls apiFetch PATCH;
 *         submitting empty/unchanged name skips the fetch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";
import type { ReactElement } from "react";

/* ── Mocks ──────────────────────────────────────────────────────────────── */

// Must be declared before importing the component so the mock factory runs first.

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("@/lib/api-fetch", () => ({
  apiFetch: vi.fn(),
}));

const mockExitScenario = vi.fn();
const mockEnterScenario = vi.fn();
let mockActiveScenarioId: string | null = null;

vi.mock("@/components/scenarios/scenario-context", () => ({
  useScenario: () => ({
    activeScenarioId: mockActiveScenarioId,
    activeScenarioName: null,
    isInScenarioMode: mockActiveScenarioId !== null,
    enterScenario: mockEnterScenario,
    exitScenario: mockExitScenario,
  }),
}));

// locale context — minimal fmtDate
vi.mock("@/components/locale/locale-context", () => ({
  useLocale: () => ({
    fmtDate: (v: string) => v,
    fmtCurrency: (v: number) => String(v),
    currency: "USD",
    locale: "en-US",
    loaded: true,
  }),
}));

// SWR hook — return the scenarios passed in as prop
vi.mock("@/lib/swr", () => ({
  useScenarios: (cfg: { fallbackData?: unknown[] }) => ({
    data: cfg?.fallbackData ?? [],
    error: null,
    isLoading: false,
    mutate: vi.fn(),
  }),
  revalidate: vi.fn(),
  revalidateOnFinancialMutation: () => () => {},
  KEYS: { scenarios: "/api/scenarios" },
}));

// ScenarioBadge — trivial stub
vi.mock("@/components/scenarios/scenario-badge", () => ({
  ScenarioBadge: ({ value }: { value: string }) => <span>{value}</span>,
}));

// DataLoadError — trivial stub
vi.mock("@/components/ui/data-load-error", () => ({
  DataLoadError: () => <div>error</div>,
  classifyError: () => "unknown",
}));

/* ── Imports after mocks ────────────────────────────────────────────────── */

import { apiFetch } from "@/lib/api-fetch";
import { ScenarioCards } from "../scenario-cards";
import type { ScenarioItem } from "../scenarios-view";

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

/* ── Helpers ────────────────────────────────────────────────────────────── */

function mockOkResponse(body: unknown = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function mockErrorResponse(body: unknown = { error: "oops" }) {
  return {
    ok: false,
    status: 400,
    json: async () => body,
  } as unknown as Response;
}

/** Active, non-backup scenario */
function makeScenario(overrides: Partial<ScenarioItem> = {}): ScenarioItem {
  return {
    id: "scn-1",
    name: "Base Case",
    description: null,
    source: "manual",
    status: "active",
    color: null,
    overrideCount: 0,
    autoDeleteAt: null,
    sourceScenarioId: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderWithToast(ui: ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();
  mockActiveScenarioId = null;
});

describe("ScenarioCards — SCN-01: delete active scenario exits scenario mode", () => {
  it("calls exitScenario (not router.refresh) when deleting the currently active scenario", async () => {
    const scenario = makeScenario({ id: "scn-active" });
    mockActiveScenarioId = "scn-active";
    mockApiFetch.mockResolvedValueOnce(mockOkResponse());

    renderWithToast(<ScenarioCards scenarios={[scenario]} />);

    // Open the "..." menu
    const moreBtn = screen.getByRole("button", { name: /more actions/i });
    await userEvent.click(moreBtn);

    // Click Delete
    const deleteBtn = screen.getByRole("button", { name: /^delete$/i });
    await userEvent.click(deleteBtn);

    // SCN-02: a confirm dialog now gates the destructive delete — confirm it.
    const confirmDialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(confirmDialog).getByRole("button", { name: /^delete$/i })
    );

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/scenarios/scn-active",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    // exitScenario must be called — it handles cookie/sessionStorage + refresh
    await waitFor(() => expect(mockExitScenario).toHaveBeenCalledTimes(1));
    // router.refresh must NOT be called separately
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("calls router.refresh (not exitScenario) when deleting a NON-active scenario", async () => {
    const scenario = makeScenario({ id: "scn-other" });
    // Active scenario is a different one
    mockActiveScenarioId = "scn-active";
    mockApiFetch.mockResolvedValueOnce(mockOkResponse());

    renderWithToast(<ScenarioCards scenarios={[scenario]} />);

    const moreBtn = screen.getByRole("button", { name: /more actions/i });
    await userEvent.click(moreBtn);

    const deleteBtn = screen.getByRole("button", { name: /^delete$/i });
    await userEvent.click(deleteBtn);

    // SCN-02: a confirm dialog now gates the destructive delete — confirm it.
    const confirmDialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(confirmDialog).getByRole("button", { name: /^delete$/i })
    );

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/scenarios/scn-other",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    // router.refresh for non-active delete
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    // exitScenario must NOT be called
    expect(mockExitScenario).not.toHaveBeenCalled();
  });

  it("calls router.refresh (not exitScenario) when no scenario is active and a scenario is deleted", async () => {
    const scenario = makeScenario({ id: "scn-standalone" });
    mockActiveScenarioId = null;
    mockApiFetch.mockResolvedValueOnce(mockOkResponse());

    renderWithToast(<ScenarioCards scenarios={[scenario]} />);

    const moreBtn = screen.getByRole("button", { name: /more actions/i });
    await userEvent.click(moreBtn);

    const deleteBtn = screen.getByRole("button", { name: /^delete$/i });
    await userEvent.click(deleteBtn);

    // SCN-02: a confirm dialog now gates the destructive delete — confirm it.
    const confirmDialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(confirmDialog).getByRole("button", { name: /^delete$/i })
    );

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    expect(mockExitScenario).not.toHaveBeenCalled();
  });
});

describe("ScenarioCards — SCN-03: Rename affordance", () => {
  it("shows Rename item in the menu for an active, non-backup scenario", async () => {
    renderWithToast(<ScenarioCards scenarios={[makeScenario()]} />);

    const moreBtn = screen.getByRole("button", { name: /more actions/i });
    await userEvent.click(moreBtn);

    expect(screen.getByRole("button", { name: /rename/i })).toBeInTheDocument();
  });

  it("opens the rename modal pre-filled with the current name", async () => {
    renderWithToast(<ScenarioCards scenarios={[makeScenario({ name: "My Scenario" })]} />);

    const moreBtn = screen.getByRole("button", { name: /more actions/i });
    await userEvent.click(moreBtn);

    const renameBtn = screen.getByRole("button", { name: /rename/i });
    await userEvent.click(renameBtn);

    // Modal should be open
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // The input should be pre-filled with the current name
    const input = screen.getByLabelText(/scenario name/i);
    expect((input as HTMLInputElement).value).toBe("My Scenario");
  });

  it("calls apiFetch PATCH with trimmed new name on submit", async () => {
    mockApiFetch.mockResolvedValueOnce(mockOkResponse());

    renderWithToast(<ScenarioCards scenarios={[makeScenario({ id: "scn-1", name: "Old Name" })]} />);

    // Open menu → click Rename
    await userEvent.click(screen.getByRole("button", { name: /more actions/i }));
    await userEvent.click(screen.getByRole("button", { name: /rename/i }));

    // Clear the input and type a new name (with extra whitespace that should be trimmed)
    const input = screen.getByLabelText(/scenario name/i);
    await userEvent.clear(input);
    await userEvent.type(input, "  New Name  ");

    // Submit
    const saveBtn = screen.getByRole("button", { name: /^save$/i });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/scenarios/scn-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "New Name" }),
        })
      );
    });

    // Modal closes on success
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );

    // router.refresh is called after rename
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("does NOT call apiFetch when submitting an unchanged name", async () => {
    renderWithToast(<ScenarioCards scenarios={[makeScenario({ name: "Same Name" })]} />);

    await userEvent.click(screen.getByRole("button", { name: /more actions/i }));
    await userEvent.click(screen.getByRole("button", { name: /rename/i }));

    // Name is already "Same Name" — submit without changing
    const saveBtn = screen.getByRole("button", { name: /^save$/i });
    await userEvent.click(saveBtn);

    // apiFetch should NOT be called
    expect(mockApiFetch).not.toHaveBeenCalled();

    // Modal closes (no-op path)
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  it("does NOT call apiFetch when submitting an empty name", async () => {
    renderWithToast(<ScenarioCards scenarios={[makeScenario({ name: "Some Name" })]} />);

    await userEvent.click(screen.getByRole("button", { name: /more actions/i }));
    await userEvent.click(screen.getByRole("button", { name: /rename/i }));

    const input = screen.getByLabelText(/scenario name/i);
    await userEvent.clear(input);
    // input is now empty — submit
    const saveBtn = screen.getByRole("button", { name: /^save$/i });
    await userEvent.click(saveBtn);

    expect(mockApiFetch).not.toHaveBeenCalled();

    // Modal closes
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  it("does NOT show Rename item for backup scenarios", () => {
    const backupScenario = makeScenario({ id: "bk-1", source: "backup" });
    renderWithToast(<ScenarioCards scenarios={[backupScenario]} />);

    // Backup cards have no "..." menu at all (the gate is status=active && !isBackup)
    expect(screen.queryByRole("button", { name: /more actions/i })).not.toBeInTheDocument();
  });
});
