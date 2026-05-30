import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ insights: [{ id: "a" }], cached: true, graceRemaining: null, dataChanged: false }), { status: 200 })));

import { useInsightCache } from "../use-insight-cache";
import { publishMutation } from "@/lib/mutation-bus";

function Probe() {
  const c = useInsightCache({ page: "expenses", aiEnabled: true });
  return <span data-testid="changed">{String(c.dataChanged)}</span>;
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("useInsightCache live freshness", () => {
  it("flips dataChanged instantly on a mutation event (no network)", async () => {
    render(<Probe />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("changed").textContent).toBe("false");
    act(() => { publishMutation({ domain: "expenses", method: "PATCH", at: Date.now() }); });
    expect(screen.getByTestId("changed").textContent).toBe("true");
  });
});
