import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TransactionsView } from "../transactions-view";
import type { TransactionsPayload } from "@/lib/swr";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/locale/locale-context", () => ({
  useLocale: () => ({ fmtCurrency: (n: number) => `$${n.toFixed(2)}`, fmtDate: (d: string | Date) => String(d) }),
}));
// Capture the `limit` filter each render requests, so we can assert that
// "Load more" GROWS the window (50 → 100) rather than swapping in a cursor page.
const captured = vi.hoisted(() => ({ limits: [] as Array<number | undefined> }));
// useTransactions returns the SSR-seeded initialData via fallbackData; stub to echo it.
vi.mock("@/lib/swr", async (orig) => {
  const actual = await orig<typeof import("@/lib/swr")>();
  return {
    ...actual,
    useTransactions: (f: { limit?: number } | undefined, cfg: { fallbackData?: TransactionsPayload }) => {
      captured.limits.push(f?.limit);
      return { data: cfg?.fallbackData, mutate: vi.fn() };
    },
  };
});

const accounts = [{ id: "acc-1", name: "Cash & Bank" }];
const base: TransactionsPayload = {
  data: [
    { id: "t1", companyId: "c1", accountId: "acc-1", date: "2026-01-01", amount: "100.00", description: "Manual one", vendor: "Acme", notes: null, source: "manual", externalId: null, metadata: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    { id: "t2", companyId: "c1", accountId: "acc-1", date: "2026-01-02", amount: "50.00", description: "Imported one", vendor: null, notes: null, source: "import", externalId: "x1", metadata: null, createdAt: "2026-01-02", updatedAt: "2026-01-02" },
  ],
  pagination: { hasMore: false, nextCursor: null, count: 2 },
};

describe("TransactionsView", () => {
  it("renders rows and the source label", () => {
    render(<TransactionsView companyId="c1" accounts={accounts} initialData={base} scenarioActive={false} />);
    expect(screen.getByText("Manual one")).toBeTruthy();
    expect(screen.getByText("Imported one")).toBeTruthy();
    expect(screen.getAllByText(/manual/i).length).toBeGreaterThan(0);
  });

  it("shows edit/delete only on manual rows", () => {
    render(<TransactionsView companyId="c1" accounts={accounts} initialData={base} scenarioActive={false} />);
    // one manual row ⇒ exactly one Edit affordance
    expect(screen.getAllByRole("button", { name: /edit transaction/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /delete transaction/i })).toHaveLength(1);
  });

  it("renders read-only with a notice when a scenario is active (no Add/Edit/Delete)", () => {
    render(<TransactionsView companyId="c1" accounts={accounts} initialData={base} scenarioActive />);
    expect(screen.getByText(/switch to base view/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /add transaction/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /edit transaction/i })).toBeNull();
  });

  it("'Load more' grows the page window (50 → 100), not a cursor swap", () => {
    captured.limits.length = 0;
    const withMore: TransactionsPayload = {
      ...base,
      pagination: { hasMore: true, nextCursor: null, count: 2 },
    };
    render(<TransactionsView companyId="c1" accounts={accounts} initialData={withMore} scenarioActive={false} />);
    // First render asks for the default window → no explicit limit param.
    expect(captured.limits.at(-1)).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    // After "Load more" it requests a LARGER window (100), a strict superset.
    expect(captured.limits.at(-1)).toBe(100);
  });

  it("renders integration-source rows with a badge and no edit/delete affordances", () => {
    const withIntegration: TransactionsPayload = {
      data: [
        // one manual row → should have Edit + Delete buttons
        base.data[0],
        // one integration (Stripe-synced) row → read-only, no Edit/Delete
        {
          id: "t3",
          companyId: "c1",
          accountId: "acc-1",
          date: "2026-01-03",
          amount: "299.00",
          description: "Stripe revenue sync",
          vendor: "Stripe",
          notes: null,
          source: "integration",
          externalId: "stripe_ch_xxx",
          metadata: null,
          createdAt: "2026-01-03",
          updatedAt: "2026-01-03",
        },
      ],
      pagination: { hasMore: false, nextCursor: null, count: 2 },
    };
    render(<TransactionsView companyId="c1" accounts={accounts} initialData={withIntegration} scenarioActive={false} />);

    // 1. The integration row renders (description is visible)
    expect(screen.getByText("Stripe revenue sync")).toBeTruthy();

    // 2. The SourcePill renders the "integration" label (uppercased via CSS, text node is lowercase)
    expect(screen.getByText("integration")).toBeTruthy();

    // 3. Only the manual row gets Edit/Delete buttons — the integration row gets none
    expect(screen.getAllByRole("button", { name: /edit transaction/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /delete transaction/i })).toHaveLength(1);
  });

  it("links to the accounts page (forward nav, mirrors Funding → cap table)", () => {
    const { rerender } = render(
      <TransactionsView companyId="c1" accounts={accounts} initialData={base} scenarioActive={false} />,
    );
    const link = screen.getByRole("link", { name: /manage accounts/i });
    expect(link.getAttribute("href")).toBe("/transactions/accounts");
    // Still reachable while a scenario is active (account management is not gated).
    rerender(<TransactionsView companyId="c1" accounts={accounts} initialData={base} scenarioActive />);
    expect(screen.getByRole("link", { name: /manage accounts/i }).getAttribute("href")).toBe(
      "/transactions/accounts",
    );
  });
});
