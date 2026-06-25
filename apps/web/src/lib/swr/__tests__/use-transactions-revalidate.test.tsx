/**
 * B1 — the /transactions table must update the instant an add/edit/delete lands
 * (not only on manual reload). useTransactions subscribes to the financial
 * mutation bus and revalidates its SWR key. apiFetch publishes a MutationEvent on
 * every successful mutating request, and `/transactions` maps to the "expenses"
 * domain — so transaction CRUD already broadcasts; the hook just needs to listen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import { useTransactions, type TransactionsPayload } from "../hooks";
import { publishMutation, resetMutationBusForTesting } from "@/lib/mutation-bus";

function Probe() {
  const { data } = useTransactions();
  return <span data-testid="count">{data?.pagination.count ?? "—"}</span>;
}

function renderProbe(fetcher: () => Promise<TransactionsPayload>) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, fetcher }}>
      <Probe />
    </SWRConfig>,
  );
}

function payload(count: number): TransactionsPayload {
  return { data: [], pagination: { hasMore: false, nextCursor: null, count } };
}

describe("useTransactions — live revalidation on financial mutation (B1)", () => {
  beforeEach(() => resetMutationBusForTesting());

  it("refetches transactions when a financial mutation publishes (same tab)", async () => {
    let n = 1;
    const fetcher = vi.fn(async () => payload(n));
    const { getByTestId } = renderProbe(fetcher);

    await waitFor(() => expect(getByTestId("count").textContent).toBe("1"));
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Simulate a transaction add/edit/delete committing (apiFetch publishes this
    // for /transactions → "expenses").
    n = 4;
    await act(async () => {
      publishMutation({ domain: "expenses", method: "POST", at: 1 });
    });

    await waitFor(() => expect(getByTestId("count").textContent).toBe("4"));
    expect(fetcher.mock.calls.length).toBeGreaterThan(1);
  });

  it("ignores non-financial ('other') mutations", async () => {
    let n = 1;
    const fetcher = vi.fn(async () => payload(n));
    renderProbe(fetcher);

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    n = 9;
    await act(async () => {
      publishMutation({ domain: "other", method: "POST", at: 1 });
    });
    await new Promise((r) => setTimeout(r, 40));

    expect(fetcher).toHaveBeenCalledTimes(1); // no refetch for non-financial domains
  });
});
