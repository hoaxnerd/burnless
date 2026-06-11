import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { apiFetch } from "@/lib/api-fetch";
import { ExpensesStep } from "../expenses-step";
import type { WizardStepHandle } from "../../types";

vi.mock("@/lib/api-fetch", () => ({ apiFetch: vi.fn() }));

// Branch the mock on url + method:
//   GET  /api/accounts        -> default accounts (operating_expense + cogs + others)
//   POST /api/forecast-lines  -> created line
function mockApi(url: unknown, init?: RequestInit) {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u === "/api/accounts" && method === "GET") {
    return Promise.resolve({
      ok: true,
      json: async () => [
        { id: "a1", name: "Cloud Infrastructure", category: "operating_expense" },
        { id: "a2", name: "Cost of Goods Sold", category: "cogs" },
      ],
    } as Response);
  }
  if (u === "/api/forecast-lines" && method === "POST") {
    return Promise.resolve({ ok: true, json: async () => ({ id: "f1" }) } as Response);
  }
  return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
}

describe("ExpensesStep", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation(mockApi as typeof apiFetch);
  });

  it("loads the company default accounts and feeds them to the real ExpenseForm", async () => {
    render(
      <ExpensesStep
        suggestions={[
          {
            id: "draft-1",
            accountId: "",
            method: "fixed",
            parameters: { amount: 1000 },
            startDate: "2025-01-01",
            endDate: null,
            name: "AWS",
            subcategory: "Cloud Infrastructure",
          },
        ]}
      />,
    );

    // Accounts load asynchronously; the GET fires on mount.
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/accounts"));

    // Open the form for the AI draft and assert the real ExpenseForm received
    // a non-empty accounts list (the "Cloud Infrastructure" option is present).
    fireEvent.click(await screen.findByRole("button", { name: /edit/i }));

    // The real ExpenseForm's Account <select> lists the loaded accounts; the
    // "Cloud Infrastructure" option being present proves the non-empty accounts
    // list reached the form. (It also appears in the Category list, hence All.)
    const options = await screen.findAllByRole("option", { name: "Cloud Infrastructure" });
    expect(options.length).toBeGreaterThan(0);
  });

  it("opens the add form and POSTs /api/forecast-lines on submit", async () => {
    render(<ExpensesStep />);

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/accounts"));

    fireEvent.click(await screen.findByRole("button", { name: /add an expense/i }));

    // Real ExpenseForm renders; pick the account + a valid amount, then submit.
    const accountSelect = await screen.findByLabelText(/^account$/i);
    fireEvent.change(accountSelect, { target: { value: "a1" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1000" } });

    // happy-dom: submit the form directly (a button click doesn't dispatch submit).
    fireEvent.submit(screen.getByRole("form", { name: /add expense/i }));

    await waitFor(() => {
      const posted = vi
        .mocked(apiFetch)
        .mock.calls.find(([u, init]) => String(u) === "/api/forecast-lines" && init?.method === "POST");
      expect(posted).toBeTruthy();
    });
  });

  it("#7 submit() auto-saves every un-saved suggestion (POST) and returns true", async () => {
    const ref = createRef<WizardStepHandle>();
    render(
      <ExpensesStep
        ref={ref}
        suggestions={[
          {
            id: "draft-1",
            accountId: "a1",
            method: "fixed",
            parameters: { amount: 1000 },
            startDate: "2025-01-01",
            endDate: null,
            name: "AWS",
            subcategory: "Cloud Infrastructure",
          },
        ]}
      />,
    );

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/accounts"));

    const result = await ref.current!.submit();
    expect(result).toBe(true);

    const posted = vi
      .mocked(apiFetch)
      .mock.calls.find(
        ([u, init]) => String(u) === "/api/forecast-lines" && init?.method === "POST",
      );
    expect(posted).toBeTruthy();
    const body = JSON.parse(posted![1]?.body as string);
    expect(body.name).toBe("AWS");

    // After auto-save the row is "Saved" and still editable (#5).
    await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
    expect(screen.getByRole("button", { name: /edit/i })).toBeTruthy();
  });

  it("#7 submit() resolves a blank accountId and normalizes the payload (fixes name:Invalid)", async () => {
    const ref = createRef<WizardStepHandle>();
    render(
      <ExpensesStep
        ref={ref}
        suggestions={[
          {
            // The page maps AI suggestions with an EMPTY accounts list, so the
            // stored row's accountId is blank and the name is a free-form display
            // label with spaces (invalid as a forecast-line identifier).
            id: "draft-1",
            accountId: "",
            method: "fixed",
            parameters: { amount: 1000 },
            startDate: "2025-01-01",
            endDate: null,
            name: "AWS Hosting",
            subcategory: "Cloud Infrastructure",
          },
        ]}
      />,
    );

    // Accounts load async AFTER useDraftList is created — the flush must see them
    // via the ref, not a stale [] closure.
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/accounts"));

    const result = await ref.current!.submit();
    expect(result).toBe(true);

    const posted = vi
      .mocked(apiFetch)
      .mock.calls.find(
        ([u, init]) => String(u) === "/api/forecast-lines" && init?.method === "POST",
      );
    expect(posted).toBeTruthy();
    const body = JSON.parse(posted![1]?.body as string);

    // accountId resolved to a real loaded account (matched "Cloud Infrastructure").
    expect(body.accountId).toBe("a1");
    expect(body.accountId).not.toBe("");
    // The free-form display name (spaces) is dropped to null so it passes
    // createForecastLineSchema's forecastLineName() identifier regex.
    expect(body.name).toBeNull();
    // Normalized shape: method + parameters present.
    expect(body.method).toBe("fixed");
    expect(body.parameters).toEqual({ amount: 1000 });
  });

  it("#7 submit() returns false when a POST fails", async () => {
    vi.mocked(apiFetch).mockImplementation(((url: unknown, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      if (u === "/api/accounts" && method === "GET") {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: "a1", name: "Cloud Infrastructure", category: "operating_expense" },
          ],
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 400,
        json: async () => ({ error: "boom" }),
        text: async () => "boom",
      } as Response);
    }) as typeof apiFetch);

    const ref = createRef<WizardStepHandle>();
    render(
      <ExpensesStep
        ref={ref}
        suggestions={[
          {
            id: "draft-1",
            accountId: "a1",
            method: "fixed",
            parameters: { amount: 1000 },
            startDate: "2025-01-01",
            endDate: null,
            name: "AWS",
            subcategory: "Cloud Infrastructure",
          },
        ]}
      />,
    );

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/accounts"));

    const result = await ref.current!.submit();
    expect(result).toBe(false);
  });
});
