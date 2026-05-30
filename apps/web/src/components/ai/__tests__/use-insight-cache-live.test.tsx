import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
  new Response(JSON.stringify({ insights: [{ id: "a" }], cached: true, graceRemaining: null, dataChanged: false }), { status: 200 })
);
vi.stubGlobal("fetch", fetchMock);

import { useInsightCache } from "../use-insight-cache";
import { publishMutation, resetMutationBusForTesting } from "@/lib/mutation-bus";

function Probe() {
  const c = useInsightCache({ page: "expenses", aiEnabled: true });
  return <span data-testid="changed">{String(c.dataChanged)}</span>;
}

beforeEach(() => {
  resetMutationBusForTesting();
  fetchMock.mockClear();
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); });

describe("useInsightCache live freshness", () => {
  it("flips dataChanged instantly on a financial mutation event (no network)", async () => {
    render(<Probe />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("changed").textContent).toBe("false");
    act(() => { publishMutation({ domain: "expenses", method: "PATCH", at: Date.now() }); });
    expect(screen.getByTestId("changed").textContent).toBe("true");
  });

  it("ignores non-financial ('other') events — no badge, no loop", async () => {
    render(<Probe />);
    await act(async () => { await Promise.resolve(); });
    act(() => { publishMutation({ domain: "other", method: "POST", at: Date.now() }); });
    expect(screen.getByTestId("changed").textContent).toBe("false");
  });

  it("auto-regenerates at most ONCE when the grace settles", async () => {
    render(<Probe />);
    await act(async () => { await Promise.resolve(); });
    fetchMock.mockClear(); // ignore the mount fetchCached GET
    act(() => { publishMutation({ domain: "expenses", method: "PATCH", at: Date.now() }); });
    // Advance well past the 5-minute grace + many extra ticks.
    await act(async () => { vi.advanceTimersByTime(305_000); await Promise.resolve(); });
    const insightPosts = fetchMock.mock.calls.filter(
      ([url, init]) => String(url).includes("/api/insights") && (init as RequestInit | undefined)?.method === "POST"
    );
    expect(insightPosts.length).toBe(1);
  });
});
