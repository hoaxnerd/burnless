"use client";

import { ratioToPct } from "@burnless/engine";
import type { CapTable } from "@burnless/engine";

export function CapTableView({ capTable }: { capTable: CapTable }) {
  const fd = capTable.totalFullyDiluted;

  return (
    <div className="space-y-6 p-6">
      <header>
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
              <td className="p-2 text-right">{ratioToPct(r.ownershipPercent).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="p-3 border rounded">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-semibold">{ratioToPct(pct).toFixed(1)}%</div>
    </div>
  );
}
