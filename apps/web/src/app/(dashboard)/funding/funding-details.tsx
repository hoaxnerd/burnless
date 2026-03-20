"use client";

interface FundingRound {
  id: string;
  name: string;
  type: string;
  amount: number;
  date: string;
  preMoneyValuation: number | null;
  dilutionPercent: number | null;
  isProjected: boolean;
}

interface FundingDetailsProps {
  rounds: FundingRound[];
  foundersOwnership: number;
  currentCash: number;
  currentBurn: number;
  currentRunway: number;
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

const roundTypeLabels: Record<string, string> = {
  pre_seed: "Pre-Seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c_plus: "Series C+",
  debt: "Debt",
  grant: "Grant",
};

export function FundingDetails({
  rounds,
  foundersOwnership,
  currentCash,
  currentBurn,
  currentRunway,
}: FundingDetailsProps) {
  const completedRounds = rounds.filter((r) => !r.isProjected);
  const projectedRounds = rounds.filter((r) => r.isProjected);

  // Build cap table segments
  const capTableSegments: Array<{ label: string; percent: number; color: string }> = [];
  capTableSegments.push({ label: "Founders", percent: foundersOwnership, color: "bg-brand-500" });

  let remaining = 100 - foundersOwnership;
  const investorColors = ["bg-violet-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
  completedRounds.forEach((round, i) => {
    const dilution = round.dilutionPercent ?? 0;
    if (dilution > 0) {
      capTableSegments.push({
        label: round.name,
        percent: dilution,
        color: investorColors[i % investorColors.length]!,
      });
    }
  });

  // Add ESOP pool if there's remaining allocation
  const usedPercent = capTableSegments.reduce((sum, s) => sum + s.percent, 0);
  if (usedPercent < 100) {
    capTableSegments.push({ label: "Option Pool", percent: 100 - usedPercent, color: "bg-surface-300" });
  }

  return (
    <div className="space-y-6">
      {/* Funding Rounds */}
      <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-200">
          <h2 className="text-lg font-semibold text-surface-900">Funding Rounds</h2>
        </div>

        {rounds.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="text-4xl mb-4">🏦</div>
            <h3 className="text-lg font-semibold text-surface-900 mb-2">No funding rounds yet</h3>
            <p className="text-sm text-surface-500 mb-4">
              Track your fundraising history — amounts, valuations, dilution, and investors.
            </p>
            <p className="text-xs text-surface-400">
              Use the AI companion or API: <code className="text-brand-600">POST /api/funding-rounds</code> (via scenarios)
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">Round</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">Type</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Amount</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Pre-Money</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Dilution</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {completedRounds.map((round) => (
                <tr key={round.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-surface-900">{round.name}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-surface-600">{roundTypeLabels[round.type] ?? round.type}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-semibold text-surface-900">{formatCurrency(round.amount)}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm text-surface-600">
                      {round.preMoneyValuation ? formatCurrency(round.preMoneyValuation) : "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm text-surface-600">
                      {round.dilutionPercent ? `${round.dilutionPercent.toFixed(0)}%` : "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-surface-500">
                      {new Date(round.date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </span>
                  </td>
                </tr>
              ))}
              {projectedRounds.map((round) => (
                <tr key={round.id} className="border-b border-surface-100 bg-surface-50/50">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-surface-600 flex items-center gap-1.5">
                      <span className="text-xs">🔮</span>
                      {round.name}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-surface-500 italic">{roundTypeLabels[round.type] ?? round.type}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-medium text-surface-500 italic">{formatCurrency(round.amount)}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm text-surface-400 italic">
                      {round.preMoneyValuation ? formatCurrency(round.preMoneyValuation) : "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm text-surface-400 italic">
                      {round.dilutionPercent ? `${round.dilutionPercent.toFixed(0)}%` : "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-surface-400 italic">
                      {new Date(round.date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Cap Table */}
      {rounds.length > 0 && (
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Cap Table</h2>

          {/* Visual bar */}
          <div className="flex rounded-lg overflow-hidden h-8 mb-4">
            {capTableSegments.map((seg, i) => (
              <div
                key={i}
                className={`${seg.color} flex items-center justify-center text-white text-xs font-medium`}
                style={{ width: `${Math.max(seg.percent, 2)}%` }}
                title={`${seg.label}: ${seg.percent.toFixed(1)}%`}
              >
                {seg.percent >= 8 && `${seg.percent.toFixed(0)}%`}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4">
            {capTableSegments.map((seg, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-sm ${seg.color}`} />
                <span className="text-xs text-surface-600">
                  {seg.label}: {seg.percent.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Fundraising insight */}
      {currentRunway > 0 && currentRunway < 18 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg">💡</span>
            <div>
              <p className="text-sm font-medium text-surface-900">Fundraising Readiness</p>
              <p className="text-xs text-surface-600 mt-0.5">
                With {Math.round(currentRunway)} months of runway at {formatCurrency(currentBurn)}/mo burn,
                {currentRunway <= 6
                  ? " you should be actively fundraising now."
                  : currentRunway <= 12
                  ? " consider starting fundraising conversations in the next few months."
                  : " you have time to focus on growth before your next raise."}
                {" "}Ask the AI companion for a fundraising readiness assessment.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
