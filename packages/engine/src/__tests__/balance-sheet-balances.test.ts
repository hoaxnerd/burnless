/**
 * Guard test [RPT-01] — the balance sheet MUST balance:
 *   Total Assets === Total Liabilities + Total Equity   (every month, |diff| < 0.01)
 *
 * Root cause (confirmed): the synthetic balance-sheet inputs put Cash (= cash
 * position, which already deducted the FULL expense each month) as the only
 * asset, set Equity = Paid-in Capital + Retained Earnings (≈ Cash), and then
 * inject an Accounts Payable liability via workingCapitalAdjustments with NO
 * offsetting asset and no add-back to cash. So Assets ≈ Equity, and the A/P
 * liability dangles: Assets ≠ Liabilities + Equity. `generateBalanceSheet` sums
 * each category independently and never enforces the accounting identity.
 *
 * This fixture mirrors that exact shape (Cash asset == Equity, dangling A/P).
 * It is RED now; when the A/P gets a double-entry counterpart (A/P added back
 * to the Cash asset, or Retained Earnings made the balancing plug) it goes GREEN.
 */

import { describe, it, expect } from "vitest";
import {
  generateBalanceSheet,
  type AccountData,
  type WorkingCapitalAdjustments,
} from "../statements";
import type { MonthlySeries } from "../utils";

function makeSeries(values: Record<string, number>): MonthlySeries {
  return new Map(Object.entries(values));
}

describe("generateBalanceSheet — accounting identity holds (RPT-01)", () => {
  // Representative horizon incl. a zero-revenue month, funding inflow, and A/P
  // timing. Cash = startingCash + funding + cumulative net income; Equity =
  // paid-in (startingCash + funding) + retained earnings (cumulative NI). By
  // construction Cash ≈ Equity, so any nonzero A/P liability breaks the identity.
  const months = ["2026-01", "2026-02", "2026-03"];

  // Month-by-month: NI = [+3000, -2000, 0(zero-revenue)]; funding +500000 in Jan.
  const startingCash = 100000;
  const funding = 500000;
  const cumulativeNI = [3000, 1000, 1000]; // 3000, 3000-2000, +0
  const cash = makeSeries({
    "2026-01": startingCash + funding + cumulativeNI[0]!,
    "2026-02": startingCash + funding + cumulativeNI[1]!,
    "2026-03": startingCash + funding + cumulativeNI[2]!,
  });

  // Equity = paid-in capital (starting + funding) + retained earnings (cum NI).
  const equity = makeSeries({
    "2026-01": startingCash + funding + cumulativeNI[0]!,
    "2026-02": startingCash + funding + cumulativeNI[1]!,
    "2026-03": startingCash + funding + cumulativeNI[2]!,
  });

  const accounts: AccountData[] = [
    { id: "cash", name: "Cash", category: "asset", values: cash },
    { id: "equity", name: "Equity", category: "equity", values: equity },
  ];

  // Accounts Payable ≈ one month of unpaid (Net-30) expenses — the dangling
  // liability with no offsetting asset (this is what compute-financials injects).
  const apAdjustments: WorkingCapitalAdjustments = {
    arChange: new Map(),
    apChange: new Map(),
    depreciation: new Map(),
    accountsReceivable: new Map(),
    accountsPayable: makeSeries({
      "2026-01": 32000,
      "2026-02": 30000,
      "2026-03": 30000,
    }),
    capitalExpenditures: new Map(),
  };

  it("Assets === Liabilities + Equity for EVERY month (tolerance 0.01)", () => {
    const bs = generateBalanceSheet(accounts, apAdjustments);

    const byMonth = (li: { month: string; value: number }[]) =>
      new Map(li.map((v) => [v.month, v.value]));
    const assets = byMonth(bs.assets.values);
    const liabilities = byMonth(bs.liabilities.values);
    const eq = byMonth(bs.equity.values);

    const offenders: string[] = [];
    for (const m of months) {
      const a = assets.get(m) ?? 0;
      const l = liabilities.get(m) ?? 0;
      const e = eq.get(m) ?? 0;
      const diff = Math.abs(a - (l + e));
      if (diff >= 0.01) {
        offenders.push(
          `  ${m}: assets=${a}  liabilities=${l}  equity=${e}  diff=${diff.toFixed(2)}`
        );
      }
    }

    expect(
      offenders,
      `Balance sheet does not balance (A != L + E) in these months:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
