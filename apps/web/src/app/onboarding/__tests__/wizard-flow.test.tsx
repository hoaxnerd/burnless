/**
 * S4b Task 14b — onboarding wizard orchestration flow.
 *
 * The page keeps the website + enriching steps (and the enrich SSE read), then
 * hands off to the wizard. The ordered steps differ per edition:
 *  - SELF-HOST: [ai-config] → Company → Revenue → Funding → Expenses → Team
 *  - CLOUD:     Company → Revenue → Funding → Expenses → Team  (no ai-config)
 *
 * TWO-PHASE order (founder directive — the canonical TARGET WIZARD ORDER): on
 * self-host the CONFIGURATION phase (the ai-config step) runs FIRST, BEFORE the
 * DATA phase. The install-company feature makes this valid: a real per-company
 * row exists from boot, so the provider can be saved before the Company-claim
 * step. The AI enrich (which produces the company/revenue/funding/expenses/team
 * suggestions) is DEFERRED to run AFTER the provider is configured, so it uses
 * the just-configured provider:
 *
 *  - SELF-HOST: website (collect URL, NO enrich yet) → ai-config →
 *    [enrich SSE fires here, once] → Company → Revenue → … . The enrich is
 *    deferred until after the ai-config step's Continue, lands on the Company
 *    step (config → enrich → company), and is guarded so Back→Continue does not
 *    re-fire it.
 *  - CLOUD: providers are managed, the ai-config step is absent, so enrich keeps
 *    running UPFRONT at the website step exactly as before: website → [enrich] →
 *    Company → Revenue → … .
 *
 * Cloud enrich entry paths (unchanged):
 *  (a) enrich `done` (success)  → wizard Company step renders (NOT the old review).
 *  (b) enrich `agent_failed`    → the explicit AiErrorStep renders (no silent fallback).
 *  (c) enrich `!ok` / no-provider → wizard Company step renders, no error card.
 *
 * The page reads the enrich response as an SSE `ReadableStream`. We mock
 * `apiFetch("/api/onboarding/enrich", ...)` to return a Response-like object whose
 * `body.getReader()` yields `data: {...}\n\n` chunks then closes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
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
// The self-host AI-config step renders AiProvidersManager, which self-fetches via
// SWR. Mock the hooks so the empty state renders without network — same pattern
// as ai-config-step.test.tsx / ai-providers-gating.test.tsx.
vi.mock("@/lib/swr", async (o) => ({
  ...(await o<typeof import("@/lib/swr")>()),
  useAiProviders: () => ({ data: { providers: [] }, isLoading: false }),
  useAiProviderModels: () => ({ data: { models: [] }, isLoading: false }),
}));

import OnboardingPage from "../page";
import { CapabilityProvider } from "@/components/providers/capability-context";
import { EDITION_PRESETS } from "@/lib/capabilities";

/**
 * OnboardingPage reads useCapabilities() to decide whether the self-host-only
 * AI-config step is in the wizard, so every render must be wrapped in a
 * CapabilityProvider. Default is self_host (the edition that shows the step).
 */
function renderOnboarding(edition: "self_host" | "cloud" = "self_host") {
  return render(
    <CapabilityProvider value={EDITION_PRESETS[edition]}>
      <OnboardingPage />
    </CapabilityProvider> as ReactElement,
  );
}

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

/** Fill the company name + click the global shell Continue. */
async function fillCompanyAndContinue(name = "Acme Inc.") {
  await screen.findByRole("heading", { name: /your company/i });
  fireEvent.change(screen.getByLabelText(/company name/i), {
    target: { value: name },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  });
}

/**
 * Self-host helper: advance from the ai-config step (the FIRST wizard step) past
 * the deferred enrich and onto the Company step. Queues an enrich SSE response
 * (defaults to a bare `done`), clicks the shell Continue, and waits for Company.
 */
async function continueFromAiConfigToCompany(events: unknown[] = [{ type: "done" }]) {
  await screen.findByText("AI Providers");
  mockApiFetch.mockResolvedValueOnce(sseResponse(events));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  });
  await screen.findByRole("heading", { name: /your company/i });
}

/**
 * A company-POST success Response then the /api/departments fetch Response —
 * the two apiFetch calls CompanyStep + handleCompanyCreated make, in order.
 */
function queueCompanyCreate(companyId = "company-xyz") {
  mockApiFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ companyId }),
  } as unknown as Response);
  mockApiFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => [],
  } as unknown as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("S4b onboarding wizard flow", () => {
  it("(a) cloud enrich `done` → renders the wizard Company step (fields), not the review surface", async () => {
    mockApiFetch.mockResolvedValue(sseResponse([{ type: "done" }]));

    renderOnboarding("cloud");
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
    // Self-host: website submit goes to the ai-config step first; advance past it
    // (deferred enrich fires) to reach the Company step. No company POST is
    // queued — this test never claims the company.
    renderOnboarding("self_host");
    await submitWebsite();
    await continueFromAiConfigToCompany();

    // No step-owned Continue (#3): only the shell's "Continue →" button exists.
    expect(screen.queryByTestId("company-continue")).not.toBeInTheDocument();
    const continueButtons = screen.getAllByRole("button", { name: /continue/i });
    expect(continueButtons).toHaveLength(1);
  });

  it("C1: the Company step does NOT render the shell's 'Skip this step' control", async () => {
    renderOnboarding("self_host");
    await submitWebsite();
    await continueFromAiConfigToCompany();

    // Company step is mandatory (it claims/creates the company) — skipping it
    // would jump onward with no company. The shell hides Skip on this step.
    expect(
      screen.queryByRole("button", { name: /skip this step/i }),
    ).not.toBeInTheDocument();
  });

  it("C2: filling the name + clicking the shell Continue creates the company and advances to Revenue", async () => {
    renderOnboarding("self_host");
    await submitWebsite();
    // ai-config → (enrich) → Company.
    await continueFromAiConfigToCompany();
    // Now on Company — queue the company POST + departments for the claim.
    queueCompanyCreate();
    await fillCompanyAndContinue();

    // Company → Revenue (the step after Company on self-host).
    expect(
      await screen.findByRole("heading", { name: /revenue/i }),
    ).toBeInTheDocument();
  });

  it("C3: a 409 ONBOARDING_ALREADY_COMPLETE on company POST advances (onCreated path), not an error", async () => {
    renderOnboarding("self_host");
    await submitWebsite();
    await continueFromAiConfigToCompany();

    // company POST → 409 already-complete with companyId.
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
    // handleCompanyCreated fetches /api/departments.
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    } as unknown as Response);

    await fillCompanyAndContinue();

    // Advanced to Revenue — no "Company already exists" error shown.
    expect(
      await screen.findByRole("heading", { name: /revenue/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/company already exists/i),
    ).not.toBeInTheDocument();
  });

  it("(b) cloud enrich `agent_failed` → renders the explicit AI-error step", async () => {
    mockApiFetch.mockResolvedValue(
      sseResponse([{ type: "agent_failed", message: "boom", recoverable: true }]),
    );

    renderOnboarding("cloud");
    await submitWebsite();

    expect(
      await screen.findByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /enter details manually/i }),
    ).toBeInTheDocument();
  });

  it("S1: self_host — website submit goes straight to the AI-config step (the FIRST wizard step, BEFORE Company); no enrich has fired yet", async () => {
    renderOnboarding("self_host");
    await submitWebsite();

    // No enrich at the website step on self-host (it is deferred to after the
    // ai-config step) — the AI-config step (AiProvidersManager content) renders
    // first, BEFORE Company, and no enrich POST has fired.
    expect(await screen.findByText("AI Providers")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /your company/i }),
    ).not.toBeInTheDocument();
    expect(
      mockApiFetch.mock.calls.some((c) =>
        String(c[0]).includes("/api/onboarding/enrich"),
      ),
    ).toBe(false);
  });

  it("S2: cloud — providers are managed, so the AI-config step is absent; enrich runs upfront and Company Continue advances straight to Revenue", async () => {
    // enrich stream → Company (upfront, at the website step).
    mockApiFetch.mockResolvedValueOnce(sseResponse([{ type: "done" }]));
    queueCompanyCreate();

    renderOnboarding("cloud");
    await submitWebsite();

    await fillCompanyAndContinue();

    // Straight to Revenue — no AI-config step on cloud.
    expect(
      await screen.findByRole("heading", { name: /revenue/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("AI Providers")).not.toBeInTheDocument();
  });

  it("(c) cloud enrich `!ok` (no provider) → renders the wizard Company step, no error card", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "AI onboarding is disabled" }),
    } as unknown as Response);

    renderOnboarding("cloud");
    await submitWebsite();

    expect(
      await screen.findByRole("heading", { name: /your company/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /try again/i }),
    ).not.toBeInTheDocument();
  });

  it("E1: self_host — the deferred enrich fires AFTER the AI-config Continue (using the configured provider), lands on the Company step, and its suggestions reach Revenue", async () => {
    renderOnboarding("self_host");
    await submitWebsite();

    // On the AI-config step (the first wizard step). The enrich has NOT fired yet.
    expect(await screen.findByText("AI Providers")).toBeInTheDocument();
    expect(
      mockApiFetch.mock.calls.some((c) =>
        String(c[0]).includes("/api/onboarding/enrich"),
      ),
    ).toBe(false);

    // Continue from the AI-config step → the deferred enrich SSE fires once,
    // streaming a revenue suggestion, then the wizard advances to the Company
    // step (config → enrich → company).
    await continueFromAiConfigToCompany([
      {
        type: "revenue_streams",
        value: [
          { name: "Pro Plan", type: "subscription", mrr: 5000, customers: 10 },
        ],
      },
      { type: "done" },
    ]);

    // The enrich POST fired exactly once.
    const enrichCalls = mockApiFetch.mock.calls.filter((c) =>
      String(c[0]).includes("/api/onboarding/enrich"),
    );
    expect(enrichCalls).toHaveLength(1);

    // Claim the company → advance to Revenue, where the AI-enriched suggestion
    // (carried through the deferred enrich) is present.
    queueCompanyCreate();
    await fillCompanyAndContinue();
    expect(
      await screen.findByRole("heading", { name: /revenue/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/pro plan/i)).toBeInTheDocument();
  });

  it("E2: self_host — Back from Company to AI-config then Continue does NOT re-fire the enrich (enrichedRef guard)", async () => {
    renderOnboarding("self_host");
    await submitWebsite();

    await screen.findByText("AI Providers");

    // First AI-config Continue → enrich fires, advance to Company. (No company
    // POST is queued — this test never claims the company; it only checks the
    // enrich-guard on returning to ai-config.)
    await continueFromAiConfigToCompany();
    const firstEnrichCount = mockApiFetch.mock.calls.filter((c) =>
      String(c[0]).includes("/api/onboarding/enrich"),
    ).length;
    expect(firstEnrichCount).toBe(1);

    // Back to AI-config.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /back/i }));
    });
    await screen.findByText("AI Providers");

    // Continue again → must NOT re-fire enrich (guarded by enrichedRef); it just
    // advances back to Company.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    });
    await screen.findByRole("heading", { name: /your company/i });
    const secondEnrichCount = mockApiFetch.mock.calls.filter((c) =>
      String(c[0]).includes("/api/onboarding/enrich"),
    ).length;
    expect(secondEnrichCount).toBe(1);
  });

  it("E3: self_host — when the deferred enrich emits agent_failed, retry/manual recovery lands back on the Company step (NOT a stale default), avoiding a re-claim round-trip", async () => {
    renderOnboarding("self_host");
    await submitWebsite();
    await screen.findByText("AI Providers");

    // Continue from ai-config → deferred enrich fires and FAILS. (No company
    // POST is queued: the failed enrich never reaches the Company-claim step.)
    mockApiFetch.mockResolvedValueOnce(
      sseResponse([{ type: "agent_failed", message: "boom", recoverable: true }]),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    });

    // The explicit AI-error screen renders.
    await screen.findByRole("button", { name: /try again/i });

    // "Enter details manually" → recovery lands on the Company step (the
    // enrich's remembered destination), NOT bounced anywhere else.
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /enter details manually/i }),
      );
    });
    expect(
      await screen.findByRole("heading", { name: /your company/i }),
    ).toBeInTheDocument();
  });
});
