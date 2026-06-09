/**
 * Signup-name fallback (founder decision #3).
 *
 * The user's name primarily comes from the AI onboarding agent. When the AI
 * flow is SKIPPED or FAILS, an explicit name prompt must give the user a
 * chance to provide a name so they always end with one.
 *
 *  (a) Skip-AI path  → the name-fallback prompt appears before any company is
 *                      created, and the create POST carries the entered name.
 *  (b) AI-failure path → the agent_failed event routes the user to the review
 *                      step, which exposes the "Your Name" field.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

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

beforeEach(() => {
  vi.clearAllMocks();
});

function okResponse(body: unknown = { companyId: "c1", scenarioId: "s1" }) {
  return {
    ok: true,
    status: 201,
    json: async () => body,
  } as unknown as Response;
}

describe("signup-name fallback (a) skip-AI path", () => {
  it("shows the name prompt before creating the company when skipping all", async () => {
    render(<OnboardingPage />);

    // On the website step — click "Skip all" with no name collected yet.
    fireEvent.click(screen.getByRole("button", { name: /skip all/i }));

    // The name-fallback prompt appears — no company POST yet.
    expect(await screen.findByText(/one last thing/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("creates the company with the entered name after the prompt", async () => {
    mockApiFetch.mockResolvedValue(okResponse());
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole("button", { name: /skip all/i }));
    await screen.findByText(/one last thing/i);

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: "Jane Doe" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue$/i }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [, init] = mockApiFetch.mock.calls[0]!;
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.user_name).toBe("Jane Doe");
  });

  it("'Continue without a name' proceeds to create without re-prompting", async () => {
    mockApiFetch.mockResolvedValue(okResponse());
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole("button", { name: /skip all/i }));
    await screen.findByText(/one last thing/i);

    fireEvent.click(
      screen.getByRole("button", { name: /continue without a name/i }),
    );

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [, init] = mockApiFetch.mock.calls[0]!;
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.user_name).toBe("");
    // Prompt is gone (we proceeded to "creating").
    expect(screen.queryByText(/one last thing/i)).not.toBeInTheDocument();
  });
});

describe("signup-name fallback (b) AI-failure path", () => {
  it("routes to the review step (with a name field) when AI enrichment fails", async () => {
    // AI enrichment failure: the enrich endpoint responds not-ok (disabled,
    // rate-limited, or errored). page.tsx falls straight through to the review
    // step, which exposes the "Your Name" fallback field.
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "AI onboarding is disabled" }),
    } as unknown as Response);

    render(<OnboardingPage />);

    const websiteInput = screen.getByLabelText(/company website url/i);
    fireEvent.change(websiteInput, { target: { value: "stripe.com" } });
    await act(async () => {
      fireEvent.submit(websiteInput.closest("form")!);
    });

    // Review step exposes the name fallback field.
    expect(await screen.findByLabelText("Your Name")).toBeInTheDocument();
  });

  it("also surfaces the name field when the agent emits agent_failed", async () => {
    vi.useFakeTimers();
    const sse = `data: ${JSON.stringify({
      type: "agent_failed",
      message: "boom",
      recoverable: true,
    })}\n\n`;
    let read = false;
    const reader = {
      read: async () => {
        if (read) return { done: true, value: undefined };
        read = true;
        return { done: false, value: new TextEncoder().encode(sse) };
      },
    };
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    } as unknown as Response);

    render(<OnboardingPage />);

    const websiteInput = screen.getByLabelText(/company website url/i);
    fireEvent.change(websiteInput, { target: { value: "stripe.com" } });
    await act(async () => {
      fireEvent.submit(websiteInput.closest("form")!);
      // Flush the streaming read loop, then the 2.5s agent_failed → review hop.
      await vi.advanceTimersByTimeAsync(3000);
    });

    vi.useRealTimers();

    expect(screen.getByLabelText("Your Name")).toBeInTheDocument();
  });
});
