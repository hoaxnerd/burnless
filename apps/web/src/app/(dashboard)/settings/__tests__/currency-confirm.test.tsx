import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock apiFetch before importing the component
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: vi.fn(),
}));

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

    render(<SettingsPage />);

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

    render(<SettingsPage />);

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

    // No 4th apiFetch call (only 3: GET company, GET integrations, PATCH)
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
  });
});
