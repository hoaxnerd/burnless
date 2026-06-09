"use client";

import Link from "next/link";
import { ArrowLeft, PieChart } from "lucide-react";
import { ratioToPct } from "@burnless/engine";
import type { CapTable } from "@burnless/engine";
import { useLocale } from "@/components/locale/locale-context";
import { DataEmptyState } from "@/components/ui";

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
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-surface-900"
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
          action={
            <Link href="/funding" className="btn-outline-sm">
              Go to Funding
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <Link
          href="/funding"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-surface-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Funding
        </Link>
        <h1 className="text-2xl font-bold">Cap Table</h1>
        <p className="text-sm text-muted">
          {fd > 0 ? fd.toLocaleString() : "0"} shares fully diluted
        </p>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <Stat label="Common" pct={fd > 0 ? capTable.totals.commonStock / fd : 0} />
        <Stat label="Preferred" pct={fd > 0 ? capTable.totals.preferredStock / fd : 0} />
        <Stat label="SAFE Overhang" pct={fd > 0 ? capTable.totals.safeOverhang / fd : 0} />
        <Stat label="Option Pool" pct={fd > 0 ? capTable.totals.optionPoolOverhang / fd : 0} />
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left p-2">Holder</th>
            <th className="text-left p-2">Class</th>
            <th className="text-right p-2">Shares</th>
            <th className="text-right p-2">%</th>
          </tr>
        </thead>
        <tbody>
          {capTable.rows.map((r, i) => (
            <tr key={i} className="border-b">
              <td className="p-2">{r.holder}</td>
              <td className="p-2">{r.shareClass}</td>
              <td className="p-2 text-right">{r.shares.toLocaleString()}</td>
              <td className="p-2 text-right">{fmtPercent(ratioToPct(r.ownershipPercent), 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {(shareClasses.length > 0 || optionPools.length > 0) && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Capital Structure</h2>

          {shareClasses.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Share Class</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-right p-2">Issued</th>
                  <th className="text-right p-2">Authorized</th>
                </tr>
              </thead>
              <tbody>
                {shareClasses.map((sc) => (
                  <tr key={sc.id} className="border-b">
                    <td className="p-2">{sc.name}</td>
                    <td className="p-2 capitalize">{sc.classType}</td>
                    <td className="p-2 text-right">
                      {Number(sc.totalIssued).toLocaleString()}
                    </td>
                    <td className="p-2 text-right">
                      {Number(sc.totalAuthorized).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {optionPools.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Option Pool</th>
                  <th className="text-right p-2">Reserved</th>
                </tr>
              </thead>
              <tbody>
                {optionPools.map((op) => (
                  <tr key={op.id} className="border-b">
                    <td className="p-2">{op.name}</td>
                    <td className="p-2 text-right">
                      {Number(op.totalReserved).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, pct }: { label: string; pct: number }) {
  const { fmtPercent } = useLocale();
  return (
    <div className="p-3 border rounded">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-semibold">{fmtPercent(ratioToPct(pct), 1)}</div>
    </div>
  );
}
