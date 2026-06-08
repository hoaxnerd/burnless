/**
 * SCN-08 — ScenarioBanner "Compare with Base" pending affordance.
 *
 * The /scenarios/compare RSC is force-dynamic and slow, so the button reads as
 * dead without feedback. The push is wrapped in useTransition() and the Button's
 * pending state is driven from isPending. We assert the Button shows its loading
 * state while the transition is pending.
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

// Drive useTransition so isPending is true synchronously while the callback runs,
// letting us assert the Button's loading state during the pending window.
let pendingFlag = false;
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useTransition: () =>
      [
        pendingFlag,
        (cb: () => void) => {
          pendingFlag = true;
          cb();
        },
      ] as const,
  };
});

import { ScenarioBanner } from "../scenario-banner";

describe("ScenarioBanner — SCN-08 compare pending affordance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingFlag = false;
  });

  it("wraps the compare navigation in a transition (router.push called)", () => {
    render(<ScenarioBanner />);
    const button = screen.getByRole("button", { name: /compare with base/i });
    fireEvent.click(button);
    expect(mockPush).toHaveBeenCalledWith("/scenarios/compare?ids=base,scn-1");
  });

  it("shows the Button loading state while the transition is pending", () => {
    // Render with the transition already pending → Button must show its spinner
    // and be disabled (Button state='loading').
    pendingFlag = true;
    render(<ScenarioBanner />);
    const button = screen.getByRole("button", {
      name: /compare with base/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
