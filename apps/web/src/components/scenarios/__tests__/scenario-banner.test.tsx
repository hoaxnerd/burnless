/**
 * ScenarioBanner "Compare with Base" navigation.
 *
 * The /scenarios/compare RSC is force-dynamic and slow (N+1 override counts). The
 * navigation is a PLAIN router.push (NOT wrapped in useTransition): a transition
 * would hold the user on the current page with the button spinning until that slow
 * RSC fully resolved ("nothing happens"), whereas a plain push commits immediately
 * and the compare page shows its own "Loading comparison…" Suspense fallback.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/* ── Mocks ──────────────────────────────────────────────────────────────── */

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockExitScenario = vi.fn();
vi.mock("../scenario-context", () => ({
  useScenario: () => ({
    isInScenarioMode: true,
    activeScenarioId: "scn-1",
    activeScenarioName: "Bear Case",
    exitScenario: mockExitScenario,
  }),
}));

vi.mock("@/lib/swr", () => ({
  useScenario: () => ({ data: undefined }),
  useOverrideCount: () => ({ data: { count: 3 } }),
}));

import { ScenarioBanner } from "../scenario-banner";

describe("ScenarioBanner — compare navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("navigates to the compare page (base vs active scenario) on click", () => {
    render(<ScenarioBanner />);
    fireEvent.click(screen.getByRole("button", { name: /compare with base/i }));
    expect(mockPush).toHaveBeenCalledWith("/scenarios/compare?ids=base,scn-1");
  });

  it("the change-count link also opens the compare page", () => {
    render(<ScenarioBanner />);
    fireEvent.click(screen.getByRole("button", { name: /3 changes from base/i }));
    expect(mockPush).toHaveBeenCalledWith("/scenarios/compare?ids=base,scn-1");
  });

  it("does NOT disable/spin the compare button (plain push, no transition hold)", () => {
    render(<ScenarioBanner />);
    const button = screen.getByRole("button", {
      name: /compare with base/i,
    }) as HTMLButtonElement;
    fireEvent.click(button);
    // Plain navigation — the button never enters a stuck loading/disabled state;
    // loading feedback comes from the destination page's Suspense fallback.
    expect(button.disabled).toBe(false);
  });
});
