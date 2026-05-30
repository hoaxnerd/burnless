import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import {
  ScenarioProvider,
  useScenario,
  decideReconcile,
  SCENARIO_SYNC_KEY,
} from "../scenario-context";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const SCN = "20000000-0000-4000-a000-000000000200";

function setCookie(id: string) {
  document.cookie = `active-scenario-id=${id}; Path=/`;
}
function clearCookie() {
  document.cookie = "active-scenario-id=; Path=/; Max-Age=0";
}
function setSession(id: string, name: string) {
  sessionStorage.setItem("active-scenario", JSON.stringify({ id, name }));
}

function Probe() {
  const { isInScenarioMode, activeScenarioId } = useScenario();
  return (
    <div>
      <span data-testid="mode">{String(isInScenarioMode)}</span>
      <span data-testid="id">{activeScenarioId ?? "null"}</span>
      <span data-testid="header-source">
        {sessionStorage.getItem("active-scenario") ?? "null"}
      </span>
    </div>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  clearCookie();
  vi.restoreAllMocks();
});
afterEach(() => {
  sessionStorage.clear();
  clearCookie();
});

describe("decideReconcile — cookie is the authority", () => {
  it("cookie + matching session → no change", () => {
    expect(decideReconcile(SCN, SCN)).toEqual({ action: "none" });
  });

  it("cookie absent but session present → clear the per-tab header source (another tab exited)", () => {
    // THIS is the lock bug: header would be sent without a cookie -> 409.
    expect(decideReconcile(null, SCN)).toEqual({ action: "clearSession" });
  });

  it("cookie present but session missing → adopt the cookie (new/restored tab)", () => {
    expect(decideReconcile(SCN, null)).toEqual({ action: "adoptCookie", id: SCN });
  });

  it("cookie and session disagree → cookie wins", () => {
    expect(decideReconcile(SCN, "other-id")).toEqual({ action: "adoptCookie", id: SCN });
  });

  it("both absent → no change", () => {
    expect(decideReconcile(null, null)).toEqual({ action: "none" });
  });
});

describe("ScenarioProvider self-heals cross-tab divergence", () => {
  it("clears the header source when the shared cookie is removed by another tab", async () => {
    // Tab starts consistent: in scenario 200.
    setCookie(SCN);
    setSession(SCN, "Base Case");

    render(
      <ScenarioProvider>
        <Probe />
      </ScenarioProvider>
    );

    await waitFor(() => expect(screen.getByTestId("mode").textContent).toBe("true"));

    // Another tab exits the scenario: the SHARED cookie disappears, this tab's
    // sessionStorage is untouched, then the exit broadcasts a sync tick.
    act(() => {
      clearCookie();
      window.dispatchEvent(
        new StorageEvent("storage", { key: SCENARIO_SYNC_KEY, newValue: "1" })
      );
    });

    // This tab must drop its header source so the next mutation does NOT send
    // X-Scenario-Id without the cookie (the 409 lock).
    await waitFor(() => {
      expect(screen.getByTestId("mode").textContent).toBe("false");
      expect(screen.getByTestId("header-source").textContent).toBe("null");
    });
  });
});
