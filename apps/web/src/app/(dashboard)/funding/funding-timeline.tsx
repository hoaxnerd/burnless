"use client";

import { useLocale } from "@/components/locale/locale-context";

interface TimelineRound {
  id: string;
  name: string;
  type: string;
  amount: number;
  date: string;
  closeDate?: string | null;
  isProjected: boolean;
}

export function FundingTimeline({ rounds }: { rounds: TimelineRound[] }) {
  const { fmtCurrency } = useLocale();
  if (rounds.length === 0) return null;

  const sorted = [...rounds].sort((a, b) => a.date.localeCompare(b.date));
  const startYear = Number(sorted[0]!.date.slice(0, 4));
  const endYear = Number(sorted[sorted.length - 1]!.date.slice(0, 4));
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);

  const colorByType: Record<string, string> = {
    pre_seed: "bg-violet-500", seed: "bg-violet-500",
    series_a: "bg-blue-500", series_b: "bg-blue-600", series_c_plus: "bg-blue-700",
    safe: "bg-amber-500", convertible: "bg-amber-500",
    debt: "bg-rose-500", grant: "bg-emerald-500",
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Funding Timeline</div>
      <div className="relative h-24 border-l border-b">
        {years.map((y) => (
          <div key={y} className="absolute bottom-0 text-xs text-muted -mb-5" style={{ left: `${((y - startYear) / Math.max(years.length - 1, 1)) * 100}%` }}>
            {y}
          </div>
        ))}
        {sorted.map((r) => {
          const yearOffset = Number(r.date.slice(0, 4)) - startYear;
          const monthOffset = Number(r.date.slice(5, 7)) / 12;
          const xPct = ((yearOffset + monthOffset) / Math.max(years.length, 1)) * 100;
          return (
            <div
              key={r.id}
              className="absolute bottom-0 w-2"
              style={{ left: `${xPct}%`, height: `${Math.min(100, (r.amount / 5_000_000) * 100)}%` }}
              title={`${r.name} (${r.type}) — ${fmtCurrency(r.amount)}`}
            >
              <div className={`w-full h-full rounded-t ${colorByType[r.type] ?? "bg-gray-400"} ${r.isProjected ? "opacity-50" : ""}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
