import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DEFAULT_HERO_CARDS } from "@burnless/engine";
import {
  DashboardLayoutProvider,
  useDashboardLayout,
} from "../dashboard-layout-context";
import { CardSettings } from "@/components/ui/card-settings";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// apiFetch is the PATCH /api/dashboard-preferences persistence path; resolve OK
// so swapHeroCard / resetHeroCard persist without retry.
const apiFetchMock = vi.fn(
  (_url: string, _init?: RequestInit) =>
    Promise.resolve({ ok: true } as Response),
);
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: (url: string, init?: RequestInit) => apiFetchMock(url, init),
}));

// router.refresh is invoked by savePrefs — must be a no-op spy.
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}));

// Toast (error surface on persistent save failure).
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));

// SWR card-prefs hook — initialPreferences pauses it, so data is undefined.
vi.mock("@/lib/swr", () => ({
  useDashboardPreferences: () => ({ data: undefined }),
}));

// MetricsContext — provider only reads `mode`.
vi.mock("@/components/providers/metrics-context", () => ({
  useMetrics: () => ({ mode: "dynamic" }),
}));

// ── Context-level reducer behavior ────────────────────────────────────────────

function HeroProbe({
  onReady,
}: {
  onReady: (api: ReturnType<typeof useDashboardLayout>) => void;
}) {
  const api = useDashboardLayout();
  onReady(api);
  return <div data-testid="hero-cards">{api.heroCards.join(",")}</div>;
}

describe("resetHeroCard (dashboard-layout-context)", () => {
  beforeEach(() => {
    apiFetchMock.mockClear();
    refreshMock.mockClear();
  });

  it("restores the engine-default slug after a destructive swap+reset", async () => {
    let api!: ReturnType<typeof useDashboardLayout>;
    render(
      <DashboardLayoutProvider
        initialPreferences={{
          heroCards: [...DEFAULT_HERO_CARDS],
          secondaryMetrics: [],
          customMetrics: [],
        }}
      >
        <HeroProbe onReady={(a) => (api = a)} />
      </DashboardLayoutProvider>,
    );

    // Card 0 default is the engine default at index 0.
    expect(api.heroCards[0]).toBe(DEFAULT_HERO_CARDS[0]);

    // Destructive swap: card 0 now shows a different metric (the bug's setup).
    await act(async () => {
      await api.swapHeroCard(0, "grossMargin");
    });
    expect(screen.getByTestId("hero-cards").textContent).toContain("grossMargin");

    // Reset must restore the ORIGINAL default slug, not leave grossMargin.
    await act(async () => {
      await api.resetHeroCard(0);
    });
    expect(api.heroCards[0]).toBe(DEFAULT_HERO_CARDS[0]);
    expect(screen.getByTestId("hero-cards").textContent).not.toContain(
      "grossMargin",
    );

    // resetHeroCard persists through the SAME updatePrefs → savePrefs path as
    // swapHeroCard (PATCH /api/dashboard-preferences); assert the persistence
    // path was exercised. (The save queue serializes writes, so exact call
    // count is timing-dependent — the shared path is what we guard here.)
    expect(
      apiFetchMock.mock.calls.some(
        ([url]) => url === "/api/dashboard-preferences",
      ),
    ).toBe(true);
  });

  it("is a no-op for an index with no engine default (does not write undefined)", async () => {
    let api!: ReturnType<typeof useDashboardLayout>;
    render(
      <DashboardLayoutProvider
        initialPreferences={{
          heroCards: [...DEFAULT_HERO_CARDS, "customExtra"],
          secondaryMetrics: [],
          customMetrics: [],
        }}
      >
        <HeroProbe onReady={(a) => (api = a)} />
      </DashboardLayoutProvider>,
    );

    const extraIndex = DEFAULT_HERO_CARDS.length; // beyond the default range
    await act(async () => {
      await api.resetHeroCard(extraIndex);
    });
    expect(api.heroCards[extraIndex]).toBe("customExtra");
    expect(api.heroCards).not.toContain(undefined);
  });
});

// ── CardSettings reset wiring (slug + mode reset together) ─────────────────────

describe("CardSettings Reset to default (DASH-01 wiring)", () => {
  it("calls BOTH onModeChange(null) and onResetForCard so slug + mode reset together", () => {
    const onModeChange = vi.fn();
    const onResetForCard = vi.fn();

    render(
      <CardSettings
        currentMode="dynamic"
        onModeChange={onModeChange}
        isOverride={false}
        onResetForCard={onResetForCard}
      />,
    );

    // Open the settings modal.
    fireEvent.click(screen.getByLabelText("Card settings"));

    // Even with no per-card mode override, a hero card exposes 'Reset to default'
    // because a slug-reset is available (the old code hid it when !isOverride).
    const resetBtn = screen.getByText("Reset to default");
    fireEvent.click(resetBtn);

    expect(onModeChange).toHaveBeenCalledWith(null);
    expect(onResetForCard).toHaveBeenCalledTimes(1);
  });

  it("shows 'Using global default' (no reset) when neither override nor reset callback exists", () => {
    render(
      <CardSettings
        currentMode="dynamic"
        onModeChange={vi.fn()}
        isOverride={false}
      />,
    );
    fireEvent.click(screen.getByLabelText("Card settings"));
    expect(screen.getByText("Using global default")).toBeInTheDocument();
    expect(screen.queryByText("Reset to default")).not.toBeInTheDocument();
  });
});
