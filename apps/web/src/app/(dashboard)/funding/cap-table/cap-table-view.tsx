"use client";

import Link from "next/link";
import { ArrowLeft, PieChart } from "lucide-react";
import { ratioToPct } from "@burnless/engine";
import type { CapTable } from "@burnless/engine";
import { useLocale } from "@/components/locale/locale-context";
import { DataEmptyState, HeroKpiCard } from "@/components/ui";
import { CapTableManager } from "./cap-table-manager";
import { ShareClassForm } from "./share-class-form";

/**
 * Cap-table can carry an explicit emptiness signal [FUND-05 / ESL-1]. When
 * `isEmpty` is true (no rows AND zero fully-diluted shares), we render a
 * `DataEmptyState` instead of an all-zero value grid + header-only table.
 * The flag is optional so callers that pass a bare `CapTable` still type-check;
 * the view falls back to the strict all-derived-zero check.
 */
type CapTableWithEmpty = CapTable & { isEmpty?: boolean };

/**
 * Raw share-class row as persisted (server-wired via U1). Share counts are
 * `numeric(18,0)` columns — they arrive as STRINGS (cap-table contract). The
 * UI is currency-agnostic: render share counts as-is, never recompute footing.
 */
export interface ShareClassRow {
  id: string;
  name: string;
  classType: "common" | "preferred";
  totalAuthorized: string;
  totalIssued: string;
  /** Liquidation preference multiple (numeric → string). Optional: present on
   * raw DB rows; the footing view does not need it. */
  liquidationPreference?: string;
}

/** Raw option-pool row as persisted (server-wired via U1). */
export interface OptionPoolRow {
  id: string;
  name: string;
  totalReserved: string;
}

export function CapTableView({
  capTable,
  shareClasses = [],
  optionPools = [],
}: {
  capTable: CapTableWithEmpty;
  shareClasses?: ShareClassRow[];
  optionPools?: OptionPoolRow[];
}) {
  const { fmtPercent } = useLocale();
  const fd = capTable.totalFullyDiluted;
  const isEmpty =
    capTable.isEmpty ?? (capTable.rows.length === 0 && fd === 0);

  // FUND-05: empty branch precedes the value-grid so an all-zero cap-table never
  // reaches the Stat chips. Cap-table is currency-agnostic — shares/percent only.
  if (isEmpty) {
    return (
      <div className="space-y-6 p-6">
        <header className="space-y-1">
          <Link
            href="/funding"
            className="inline-flex items-center gap-1 text-sm text-surface-500 hover:text-surface-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Funding
          </Link>
          <h1 className="text-2xl font-bold">Cap Table</h1>
        </header>
        <DataEmptyState
          icon={PieChart}
          title="No share data yet"
          body="Add share classes and equity grants to build your cap table."
          // U5: a brand-new company starts the cap table from the empty state —
          // the action slot opens the share-class form (testid open-add-share-class)
          // instead of bouncing the user back to /funding.
          action={<ShareClassForm />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <Link
          href="/funding"
          className="inline-flex items-center gap-1 text-sm text-surface-500 hover:text-surface-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Funding
        </Link>
        <h1 className="text-2xl font-bold">Cap Table</h1>
        <p className="text-sm text-surface-500">
          {fd > 0 ? fd.toLocaleString() : "0"} shares fully diluted
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <HeroKpiCard
          slug="captable-common"
          label="Common"
          value={fmtPercent(ratioToPct(fd > 0 ? capTable.totals.commonStock / fd : 0), 1)}
          metricStyle={{ icon: "BarChart3", color: "blue", href: "#" }}
          hasData
          stagger={0}
        />
        <HeroKpiCard
          slug="captable-preferred"
          label="Preferred"
          value={fmtPercent(ratioToPct(fd > 0 ? capTable.totals.preferredStock / fd : 0), 1)}
          metricStyle={{ icon: "TrendingUp", color: "violet", href: "#" }}
          hasData
          stagger={1}
        />
        <HeroKpiCard
          slug="captable-safe"
          label="SAFE Overhang"
          value={fmtPercent(ratioToPct(fd > 0 ? capTable.totals.safeOverhang / fd : 0), 1)}
          metricStyle={{ icon: "Zap", color: "amber", href: "#" }}
          hasData
          stagger={2}
        />
        <HeroKpiCard
          slug="captable-pool"
          label="Option Pool"
          value={fmtPercent(ratioToPct(fd > 0 ? capTable.totals.optionPoolOverhang / fd : 0), 1)}
          metricStyle={{ icon: "DollarSign", color: "teal", href: "#" }}
          hasData
          stagger={3}
        />
      </div>

      <div className="rounded-2xl bg-surface-0 border border-surface-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-surface-100">
          <h2 className="text-base font-semibold text-surface-900">Holders</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 bg-surface-50">
              <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                Holder
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                Class
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-surface-500 uppercase tracking-wider">
                Shares
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-surface-500 uppercase tracking-wider">
                %
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {capTable.rows.map((r, i) => (
              <tr key={i} className="hover:bg-surface-50 transition-colors">
                <td className="px-4 py-3">{r.holder}</td>
                <td className="px-4 py-3">{r.shareClass}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.shares.toLocaleString()}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {fmtPercent(ratioToPct(r.ownershipPercent), 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* U5: the editable Manage section lives BELOW the foots-to-100% holder
          table (moved out of page.tsx). It owns the share-class + option-pool
          structure tables (edit/delete) — base-data only; the API routes own
          scenario safety + the single-pool guard. */}
      <CapTableManager shareClasses={shareClasses} optionPools={optionPools} />
    </div>
  );
}
