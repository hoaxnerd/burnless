import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransactionsView } from "../transactions-view";
import type { TransactionsPayload } from "@/lib/swr";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/locale/locale-context", () => ({
  useLocale: () => ({ fmtCurrency: (n: number) => `$${n.toFixed(2)}`, fmtDate: (d: string | Date) => String(d) }),
}));
// useTransactions returns the SSR-seeded initialData via fallbackData; stub to echo it.
vi.mock("@/lib/swr", async (orig) => {
  const actual = await orig<typeof import("@/lib/swr")>();
  return { ...actual, useTransactions: (_f: unknown, cfg: { fallbackData?: TransactionsPayload }) => ({ data: cfg?.fallbackData, mutate: vi.fn() }) };
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
