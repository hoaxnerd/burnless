/**
 * S4b Task 14b — onboarding wizard orchestration flow.
 *
 * The page keeps the website + enriching steps (and the enrich SSE read), then
 * hands off to the wizard (Company → Revenue → Funding → Expenses → Team). These
 * tests assert the THREE entry paths out of enrichment:
 *
 *  (a) enrich `done` (success)  → wizard Company step renders (NOT the old review).
 *  (b) enrich `agent_failed`    → the explicit AiErrorStep renders (no silent fallback).
 *  (c) enrich `!ok` / no-provider → wizard Company step renders, no error card.
 *
 * The page reads the enrich response as an SSE `ReadableStream`. We mock
 * `apiFetch("/api/onboarding/enrich", ...)` to return a Response-like object whose
 * `body.getReader()` yields `data: {...}\n\n` chunks then closes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const { mockApiFetch, mockPush } = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
  mockPush: vi.fn(),
}));

vi.mock("@/lib/api-fetch", () => ({ apiFetch: mockApiFetch }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/components/locale/locale-context", () => ({
  useLocale: () => ({
    currency: "USD",
    currencySymbol: "$",
    locale: "en-US",
    fmtCurrency: (n: number) => `$${n}`,
    fmtCompact: (n: number) => `$${n}`,
  }),
}));

import OnboardingPage from "../page";

/**
 * Build a Response-like object whose body streams the given SSE events
 * synchronously: one `data: {...}\n\n` chunk per event, then closes. The reader
 * resolves its promises immediately (deterministic — no real async timing).
 */
function sseResponse(events: unknown[], init?: { ok?: boolean; status?: number }) {
  const chunks = events.map(
    (e) => new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`),
  );
  let i = 0;
  const reader = {
    read: async () => {
      if (i < chunks.length) {
        return { done: false, value: chunks[i++] };
      }
      return { done: true, value: undefined };
    },
  };
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    body: { getReader: () => reader },
    json: async () => ({}),
  } as unknown as Response;
}

async function submitWebsite() {
  const websiteInput = screen.getByLabelText(/company website url/i);
  fireEvent.change(websiteInput, { target: { value: "stripe.com" } });
  await act(async () => {
    fireEvent.submit(websiteInput.closest("form")!);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("S4b onboarding wizard flow", () => {
  it("(a) enrich `done` → renders the wizard Company step (fields), not the review surface", async () => {
    mockApiFetch.mockResolvedValue(sseResponse([{ type: "done" }]));

    render(<OnboardingPage />);
    await submitWebsite();

    // The company step renders its fields under the shell; navigation is driven
    // by the single global shell Continue (there is no step-owned Continue).
    expect(
      await screen.findByRole("heading", { name: /your company/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
    // The old review surface is gone.
    expect(screen.queryByLabelText("Your Name")).not.toBeInTheDocument();
  });

  it("C0: there is exactly ONE Continue control (the global shell button) on the Company step", async () => {
    mockApiFetch.mockResolvedValue(sseResponse([{ type: "done" }]));

    render(<OnboardingPage />);
    await submitWebsite();

    await screen.findByRole("heading", { name: /your company/i });
    // No step-owned Continue (#3): only the shell's "Continue →" button exists.
    expect(screen.queryByTestId("company-continue")).not.toBeInTheDocument();
    const continueButtons = screen.getAllByRole("button", { name: /continue/i });
    expect(continueButtons).toHaveLength(1);
  });

  it("C1: the Company step does NOT render the shell's 'Skip this step' control", async () => {
    mockApiFetch.mockResolvedValue(sseResponse([{ type: "done" }]));

    render(<OnboardingPage />);
    await submitWebsite();

    // Company step is mandatory (it creates the company) — skipping it would
    // jump to Revenue with no company. The shell hides Skip on this step.
    await screen.findByRole("heading", { name: /your company/i });
    expect(
      screen.queryByRole("button", { name: /skip this step/i }),
    ).not.toBeInTheDocument();
  });

  it("C2: filling the name + clicking the shell Continue creates the company and advances to Revenue", async () => {
    // First call: the enrich stream → wizard Company step.
    mockApiFetch.mockResolvedValueOnce(sseResponse([{ type: "done" }]));
    // Second call: the company POST → success with a companyId.
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ companyId: "company-xyz" }),
    } as unknown as Response);
    // Third call: handleCompanyCreated fetches /api/departments.
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    } as unknown as Response);

    render(<OnboardingPage />);
    await submitWebsite();

    await screen.findByRole("heading", { name: /your company/i });
    // Company name is required before the shell Continue submits.
    fireEvent.change(screen.getByLabelText(/company name/i), {
      target: { value: "Acme Inc." },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    });

    // Advanced to Revenue (the Revenue heading is now shown).
    expect(
      await screen.findByRole("heading", { name: /revenue/i }),
    ).toBeInTheDocument();
  });

  it("C3: a 409 ONBOARDING_ALREADY_COMPLETE on company POST advances (onCreated path), not an error", async () => {
    // First call: the enrich stream → wizard Company step.
    mockApiFetch.mockResolvedValueOnce(sseResponse([{ type: "done" }]));
    // Second call: the company POST → 409 already-complete with companyId.
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        error: "Company already exists for this user",
        code: "ONBOARDING_ALREADY_COMPLETE",
        companyId: "company-abc",
        redirectTo: "/dashboard",
      }),
    } as unknown as Response);
    // Third call: handleCompanyCreated fetches /api/departments.
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    } as unknown as Response);

    render(<OnboardingPage />);
    await submitWebsite();

    await screen.findByRole("heading", { name: /your company/i });
    // Company name is required before the shell Continue submits.
    fireEvent.change(screen.getByLabelText(/company name/i), {
      target: { value: "Acme Inc." },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    });

    // Advanced to Revenue (stepper highlights Revenue) — no "Company already exists" error shown.
    expect(
      await screen.findByRole("heading", { name: /revenue/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/company already exists/i),
    ).not.toBeInTheDocument();
  });

  it("(b) enrich `agent_failed` → renders the explicit AI-error step", async () => {
    mockApiFetch.mockResolvedValue(
      sseResponse([{ type: "agent_failed", message: "boom", recoverable: true }]),
    );

    render(<OnboardingPage />);
    await submitWebsite();

    expect(
      await screen.findByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /enter details manually/i }),
    ).toBeInTheDocument();
  });

  it("(c) enrich `!ok` (no provider) → renders the wizard Company step, no error card", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "AI onboarding is disabled" }),
    } as unknown as Response);

    render(<OnboardingPage />);
    await submitWebsite();

    expect(
      await screen.findByRole("heading", { name: /your company/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /try again/i }),
    ).not.toBeInTheDocument();
  });
});
