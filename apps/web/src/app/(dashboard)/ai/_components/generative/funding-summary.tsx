"use client";
import { useValueFormatter } from "./format-hint";

export interface GenFundingRound {
  name: string;
  type: string;
  amount: number;
  date: string; // YYYY-MM-DD
  isProjected: boolean;
}

export interface GenFundingSummaryProps {
  rounds: GenFundingRound[];
  totalRaised: number;
}

/** Render a round-type slug (e.g. "series_a") as a human label ("Series A"). */
function formatRoundType(type: string): string {
  return type
    .split("_")
    .map((w) => (w.length <= 1 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Render a YYYY-MM-DD key as "Mon YYYY" without re-introducing a Date dep. */
function formatRoundDate(date: string): string {
  const [y, m] = date.split("-");
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const mi = m ? Number(m) - 1 : -1;
  if (!y || mi < 0 || mi > 11) return date;
  return `${MONTHS[mi]} ${y}`;
}

export function GenFundingSummary({ rounds, totalRaised }: GenFundingSummaryProps) {
  const fmtCurrency = useValueFormatter("currency");

  if (!rounds || rounds.length === 0) {
    return (
      <div className="my-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-surface-500">
        No funding rounds recorded.
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-surface-200 bg-surface-0 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">
          Funding rounds
        </span>
        <span className="text-sm font-semibold text-surface-900 tabular-nums">
          {fmtCurrency(totalRaised)} <span className="font-normal text-surface-500">raised</span>
        </span>
      </div>
      <ol className="relative space-y-3 border-l border-surface-200 pl-4">
        {rounds.map((round, i) => (
          <li key={`${round.name}-${i}`} className="relative">
            <span
              className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 ${
                round.isProjected
                  ? "border-dashed border-surface-300 bg-surface-0"
                  : "border-brand bg-brand"
              }`}
              aria-hidden
            />
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-surface-800">{round.name}</span>
                <span className="text-[10px] font-medium text-surface-400 uppercase tracking-wide">
                  {formatRoundType(round.type)}
                </span>
                {round.isProjected ? (
                  <span className="rounded-full border border-dashed border-surface-300 px-1.5 py-0.5 text-[10px] text-surface-400">
                    Projected
                  </span>
                ) : null}
              </div>
              <span
                className={`text-sm tabular-nums ${
                  round.isProjected ? "text-surface-400" : "font-semibold text-surface-900"
                }`}
              >
                {fmtCurrency(round.amount)}
              </span>
            </div>
            <span className="text-xs text-surface-500">{formatRoundDate(round.date)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
