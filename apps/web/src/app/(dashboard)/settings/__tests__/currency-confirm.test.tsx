import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/swr/fetcher";
import type { ReactElement } from "react";
import { CapabilityProvider } from "@/components/providers/capability-context";
import { EDITION_PRESETS } from "@/lib/capabilities";

// Mock apiFetch before importing the component
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: vi.fn(),
}));

// SettingsPage reads useSearchParams() (to pick the active tab from ?tab=...).
// Outside an app-router context that hook returns null, so the page's
// `searchParams.get("tab")` throws. Stub next/navigation with empty params.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => "/settings",
}));

// Render helper: the settings page reads company + integrations via the shared
// SWR cache (DFL-01), so the page must be wrapped in an SWRConfig whose fetcher
// routes through the mocked apiFetch. A fresh Map cache isolates each test.
function renderWithSWR(ui: ReactElement) {
  return render(
    <SWRConfig
      value={{
        fetcher,
        provider: () => new Map(),
        dedupingInterval: 0,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        errorRetryCount: 0,
      }}
    >
      {/* SettingsPage reads useCapabilities() (Task 12) — wrap in the provider. */}
      <CapabilityProvider value={EDITION_PRESETS.cloud}>{ui}</CapabilityProvider>
    </SWRConfig>,
  );
}

// Mock useAiFlags (used by SettingsPage)
vi.mock("@/components/ai/ai-feature-context", () => ({
  useAiFlags: () => ({
    flags: {},
    updateFlags: vi.fn(),
    loaded: true,
    credits: null,
    providerConfig: null,
    getFeature: () => ({ enabled: false }),
  }),
}));

import { apiFetch } from "@/lib/api-fetch";
import SettingsPage from "../page";

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

// Helper: build a mock Response-like object
function mockResponse(ok: boolean, status: number, body: unknown) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

// Company GET response
const baseCompanyGET = mockResponse(true, 200, {
  name: "Acme Inc",
  stage: "seed",
  currency: "USD",
  locale: "en-US",
  timezone: "America/New_York",
  region: "us-east",
  industry: null,
  businessModel: "saas",
  fiscalYearEnd: 12,
});

// Integrations GET response (page also fetches /api/integrations)
const integrationsGET = mockResponse(true, 200, []);

// 409 response for currency change
const conflictResponse = mockResponse(false, 409, {
  error:
    "Changing currency from USD to EUR will not convert existing financial data. All monetary values will be re-labelled in EUR but not recalculated.",
  code: "CURRENCY_CHANGE_REQUIRES_CONFIRMATION",
  requiresConfirmation: true,
  details: { from: "USD", to: "EUR" },
});

// Successful PATCH response after confirm
const successPatchResponse = mockResponse(true, 200, {
  currency: "EUR",
});

describe("Currency change confirm dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows confirm dialog on 409, retries with ?confirm=true on accept", async () => {
    // Call order:
    //  1st: GET /api/company
    //  2nd: GET /api/integrations
    //  3rd: PATCH /api/company (→ 409)
    //  4th: PATCH /api/company?confirm=true (→ 200)
    mockApiFetch
      .mockResolvedValueOnce(baseCompanyGET)   // GET /api/company
      .mockResolvedValueOnce(integrationsGET)  // GET /api/integrations
      .mockResolvedValueOnce(conflictResponse) // PATCH → 409
      .mockResolvedValueOnce(successPatchResponse); // PATCH?confirm=true → 200
    // Any trailing SWR revalidation (e.g. revalidate(KEYS.company) after save)
    // resolves to the company GET shape so the fetcher never sees `undefined`.
    mockApiFetch.mockResolvedValue(baseCompanyGET);

    renderWithSWR(<SettingsPage />);

    // Wait for company data to load — currency select shows "USD (…)"
    // getByDisplayValue matches the currently selected option's text
    await waitFor(() =>
      expect(screen.getByDisplayValue(/^USD/)).toBeInTheDocument()
    );

    // Change currency from USD to EUR via fireEvent (reliable in jsdom/happy-dom)
    const currencySelect = screen.getByDisplayValue(/^USD/);
    fireEvent.change(currencySelect, { target: { value: "EUR" } });

    // Click "Save Changes"
    const saveButton = screen.getByRole("button", { name: /save changes/i });
    await userEvent.click(saveButton);

    // Dialog should appear with the server's message
    await waitFor(() =>
      expect(
        screen.getByText(/changing currency from USD to EUR/i)
      ).toBeInTheDocument()
    );

    // Click Confirm
    const confirmButton = screen.getByRole("button", { name: /^confirm$/i });
    await userEvent.click(confirmButton);

    // The 4th call must be to /api/company?confirm=true
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls as [string, RequestInit][];
      const retryCall = calls.find(([url]) => url === "/api/company?confirm=true");
      expect(retryCall).toBeDefined();
      expect(retryCall![1]).toMatchObject({ method: "PATCH" });
    });

    // Dialog should close after success
    await waitFor(() =>
      expect(
        screen.queryByText(/changing currency from USD to EUR/i)
      ).not.toBeInTheDocument()
    );
  });

  it("reverts the currency field on cancel", async () => {
    mockApiFetch
      .mockResolvedValueOnce(baseCompanyGET)   // GET /api/company
      .mockResolvedValueOnce(integrationsGET)  // GET /api/integrations
      .mockResolvedValueOnce(conflictResponse); // PATCH → 409
    // Any further SWR read resolves to the company shape (defensive default).
    mockApiFetch.mockResolvedValue(baseCompanyGET);

    renderWithSWR(<SettingsPage />);

    await waitFor(() =>
      expect(screen.getByDisplayValue(/^USD/)).toBeInTheDocument()
    );

    // Change currency to EUR
    const currencySelect = screen.getByDisplayValue(/^USD/);
    fireEvent.change(currencySelect, { target: { value: "EUR" } });

    // Confirm dropdown now shows EUR
    expect((currencySelect as HTMLSelectElement).value).toBe("EUR");

    // Click Save
    const saveButton = screen.getByRole("button", { name: /save changes/i });
    await userEvent.click(saveButton);

    // Wait for dialog
    await waitFor(() =>
      expect(
        screen.getByText(/changing currency from USD to EUR/i)
      ).toBeInTheDocument()
    );

    // Click Cancel
    const cancelButton = screen.getByRole("button", { name: /^cancel$/i });
    await userEvent.click(cancelButton);

    // Currency dropdown should revert to USD
    await waitFor(() =>
      expect((currencySelect as HTMLSelectElement).value).toBe("USD")
    );

    // Dialog is gone
    expect(
      screen.queryByText(/changing currency from USD to EUR/i)
    ).not.toBeInTheDocument();

    // The PATCH (409) is not retried on cancel — exactly one PATCH was issued.
    const patchCalls = (mockApiFetch.mock.calls as [string, RequestInit?][]).filter(
      ([, init]) => init?.method === "PATCH",
    );
    expect(patchCalls).toHaveLength(1);
  });
});
