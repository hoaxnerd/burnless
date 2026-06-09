/**
 * SCN-05 — the scenario-head change counter must update the instant a
 * scenario-aware edit lands (not only on focus/reload). useOverrideCount
 * subscribes to the financial mutation bus and revalidates its SWR key.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import { useOverrideCount } from "../hooks";
import { publishMutation, resetMutationBusForTesting } from "@/lib/mutation-bus";

function Probe({ id }: { id: string | null }) {
  const { data } = useOverrideCount(id);
  return <span data-testid="count">{data?.count ?? "—"}</span>;
}

function renderProbe(id: string | null, fetcher: () => Promise<{ count: number }>) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, fetcher }}>
      <Probe id={id} />
    </SWRConfig>,
  );
}

describe("useOverrideCount — live revalidation on financial mutation (SCN-05)", () => {
  beforeEach(() => resetMutationBusForTesting());

  it("refetches the override count when a financial mutation publishes (same tab)", async () => {
    let n = 1;
    const fetcher = vi.fn(async () => ({ count: n }));
    const { getByTestId } = renderProbe("scn-1", fetcher);

    await waitFor(() => expect(getByTestId("count").textContent).toBe("1"));
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Simulate an expense edit committing in scenario mode (apiFetch publishes this).
    n = 4;
    await act(async () => {
      publishMutation({ domain: "expenses", method: "POST", at: 1 });
    });

    await waitFor(() => expect(getByTestId("count").textContent).toBe("4"));
    expect(fetcher.mock.calls.length).toBeGreaterThan(1);
  });

  it("ignores non-financial ('other') mutations", async () => {
    let n = 1;
    const fetcher = vi.fn(async () => ({ count: n }));
    renderProbe("scn-1", fetcher);

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    n = 9;
    await act(async () => {
      publishMutation({ domain: "other", method: "POST", at: 1 });
    });
    await new Promise((r) => setTimeout(r, 40));

    expect(fetcher).toHaveBeenCalledTimes(1); // no refetch for non-financial domains
  });

  it("does not subscribe / fetch when no scenario is active (null id)", async () => {
    const fetcher = vi.fn(async () => ({ count: 0 }));
    renderProbe(null, fetcher);

    await act(async () => {
      publishMutation({ domain: "expenses", method: "POST", at: 1 });
    });
    await new Promise((r) => setTimeout(r, 40));

    expect(fetcher).not.toHaveBeenCalled();
  });
});
