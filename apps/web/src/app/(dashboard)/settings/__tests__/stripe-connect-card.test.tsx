import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock apiFetch so we can assert the connect POST without hitting the network.
const apiFetch = vi.fn();
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

// useLocale.fmtDate — deterministic for the connected/last-sync assertion.
vi.mock("@/components/locale/locale-context", () => ({
  useLocale: () => ({ fmtDate: (d: Date | string) => `DATE(${String(d)})` }),
}));

import { StripeConnectCard } from "../stripe-connect-card";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("StripeConnectCard", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("renders the scope checklist from the connector help text", () => {
    render(<StripeConnectCard onConnected={() => {}} />);
    // Help text enumerates the read scopes — assert a few canonical entries appear.
    expect(screen.getByText(/Charges/)).toBeTruthy();
    expect(screen.getByText(/Balance transactions/)).toBeTruthy();
  });

  it("uses a password input for the key (never echoes it back as text)", () => {
    render(<StripeConnectCard onConnected={() => {}} />);
    const input = screen.getByLabelText(/Restricted API key/i) as HTMLInputElement;
    expect(input.type).toBe("password");
  });

  it("posts the pasted key to the connect route and calls onConnected on success", async () => {
    apiFetch.mockResolvedValue(jsonResponse({ ok: true, integration: { id: "int_1" } }));
    const onConnected = vi.fn();
    render(<StripeConnectCard onConnected={onConnected} />);

    fireEvent.change(screen.getByLabelText(/Restricted API key/i), {
      target: { value: "rk_test_abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Connect/i }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const call = apiFetch.mock.calls[0]!;
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toBe("/api/integrations/stripe/connect");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ apiKey: "rk_test_abc" });
    await waitFor(() => expect(onConnected).toHaveBeenCalled());
  });

  it("shows the inline JSON error on a failed connect", async () => {
    apiFetch.mockResolvedValue(
      jsonResponse({ error: "Stripe rejected that API key." }, false, 400),
    );
    render(<StripeConnectCard onConnected={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Restricted API key/i), {
      target: { value: "rk_test_bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Connect/i }));

    expect(await screen.findByText(/Stripe rejected that API key\./)).toBeTruthy();
  });

  it("when connected, shows last-sync and a Disconnect button", () => {
    const onDisconnect = vi.fn();
    render(
      <StripeConnectCard
        onConnected={() => {}}
        connected={{ id: "int_1", lastSyncAt: "2026-06-26T00:00:00.000Z" }}
        onDisconnect={onDisconnect}
      />,
    );
    // last-sync routed through fmtDate
    expect(screen.getByText(/DATE\(/)).toBeTruthy();
    const btn = screen.getByRole("button", { name: /Disconnect/i });
    fireEvent.click(btn);
    expect(onDisconnect).toHaveBeenCalledWith("int_1");
  });
});
