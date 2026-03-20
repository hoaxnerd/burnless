"use client";

/**
 * Inline SVG charts rendered within AI chat messages.
 * Supports: forecast_revenue, benchmark_metrics, model_dilution.
 */

interface ToolResultData {
  tool: string;
  data: Record<string, unknown>;
}

export function InlineChart({ result }: { result: ToolResultData }) {
  if (!result.data || !(result.data as { success?: boolean }).success) return null;

  switch (result.tool) {
    case "forecast_revenue":
      return <RevenueForecastChart data={result.data} />;
    case "benchmark_metrics":
      return <BenchmarkChart data={result.data} />;
    case "model_dilution":
      return <DilutionChart data={result.data} />;
    default:
      return null;
  }
}

// ── Revenue Forecast Line Chart ──────────────────────────────────────────────

function RevenueForecastChart({ data }: { data: Record<string, unknown> }) {
  const forecast = data.forecast as Array<{
    month: string;
    projected: number;
    low: number | null;
    high: number | null;
  }>;
  if (!forecast || forecast.length === 0) return null;

  const lastRevenue = data.lastMonthRevenue as number;
  const allValues = [lastRevenue, ...forecast.map((f) => f.projected)];
  const allHighs = forecast.filter((f) => f.high !== null).map((f) => f.high as number);
  const allLows = forecast.filter((f) => f.low !== null).map((f) => f.low as number);
  const maxVal = Math.max(...allValues, ...allHighs) * 1.1;
  const minVal = Math.min(...allValues.filter((v) => v > 0), ...allLows.filter((v) => v > 0)) * 0.9;

  const w = 360;
  const h = 140;
  const pad = { top: 12, right: 12, bottom: 24, left: 12 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const points = [lastRevenue, ...forecast.map((f) => f.projected)];
  const toX = (i: number) => pad.left + (i / (points.length - 1)) * plotW;
  const toY = (v: number) => pad.top + (1 - (v - minVal) / (maxVal - minVal)) * plotH;

  const line = points.map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(" ");

  // Confidence interval path
  let ciBand = "";
  const hasCI = forecast.some((f) => f.high !== null);
  if (hasCI) {
    const highPoints = [{ v: lastRevenue, i: 0 }, ...forecast.map((f, i) => ({ v: f.high ?? f.projected, i: i + 1 }))];
    const lowPoints = [{ v: lastRevenue, i: 0 }, ...forecast.map((f, i) => ({ v: f.low ?? f.projected, i: i + 1 }))];

    const upper = highPoints.map((p) => `${p.i === 0 ? "M" : "L"} ${toX(p.i).toFixed(1)} ${toY(p.v).toFixed(1)}`).join(" ");
    const lower = [...lowPoints].reverse().map((p, j) => `${j === 0 ? "L" : "L"} ${toX(p.i).toFixed(1)} ${toY(p.v).toFixed(1)}`).join(" ");
    ciBand = `${upper} ${lower} Z`;
  }

  const method = data.method as string;
  const growth = data.averageGrowthRate as number;

  return (
    <div className="mt-2 rounded-lg border border-surface-200 bg-surface-0 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">Revenue Forecast</span>
        <span className="text-[10px] text-surface-400">{method} &middot; {(growth * 100).toFixed(1)}%/mo avg</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        {/* CI band */}
        {ciBand && <path d={ciBand} fill="rgba(59, 130, 246, 0.08)" stroke="none" />}
        {/* Projected line */}
        <path d={line} fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Dot at start (actual) */}
        <circle cx={toX(0)} cy={toY(lastRevenue)} r="3" fill="#10B981" />
        {/* Dot at end (projected) */}
        <circle cx={toX(points.length - 1)} cy={toY(points[points.length - 1]!)} r="3" fill="#3B82F6" />
        {/* Month labels */}
        {[0, Math.floor(forecast.length / 2), forecast.length - 1].map((idx) => (
          <text
            key={idx}
            x={toX(idx + 1)}
            y={h - 4}
            textAnchor="middle"
            className="fill-surface-400"
            fontSize="8"
          >
            {forecast[idx]?.month.slice(5)}
          </text>
        ))}
        {/* Value labels */}
        <text x={toX(0)} y={toY(lastRevenue) - 6} textAnchor="start" className="fill-emerald-600" fontSize="8" fontWeight="600">
          ${formatCompact(lastRevenue)}
        </text>
        <text x={toX(points.length - 1)} y={toY(points[points.length - 1]!) - 6} textAnchor="end" className="fill-blue-600" fontSize="8" fontWeight="600">
          ${formatCompact(points[points.length - 1]!)}
        </text>
      </svg>
    </div>
  );
}

// ── Benchmark Horizontal Bar Chart ───────────────────────────────────────────

function BenchmarkChart({ data }: { data: Record<string, unknown> }) {
  const benchmarks = data.benchmarks as Array<{
    metric: string;
    actual: number | null;
    benchmark: { median: number; top25: number; bottom25: number; unit: string };
    rating: "above" | "at" | "below" | "unknown";
  }>;
  if (!benchmarks || benchmarks.length === 0) return null;

  const ratingColors: Record<string, string> = {
    above: "bg-emerald-500",
    at: "bg-amber-400",
    below: "bg-red-400",
    unknown: "bg-surface-300",
  };

  const ratingLabels: Record<string, string> = {
    above: "Top 25%",
    at: "Median",
    below: "Below median",
    unknown: "N/A",
  };

  return (
    <div className="mt-2 rounded-lg border border-surface-200 bg-surface-0 p-3">
      <span className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">
        Benchmark Comparison ({data.stage as string})
      </span>
      <div className="mt-2 space-y-2">
        {benchmarks.slice(0, 6).map((b) => (
          <div key={b.metric} className="flex items-center gap-2">
            <span className="text-[10px] text-surface-600 w-20 truncate">{b.metric.replace(/_/g, " ")}</span>
            <div className="flex-1 h-2 bg-surface-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${ratingColors[b.rating] ?? "bg-surface-300"}`}
                style={{ width: b.rating === "above" ? "85%" : b.rating === "at" ? "50%" : b.rating === "below" ? "25%" : "10%" }}
              />
            </div>
            <span className={`text-[9px] font-medium w-16 text-right ${
              b.rating === "above" ? "text-emerald-600" : b.rating === "at" ? "text-amber-600" : b.rating === "below" ? "text-red-500" : "text-surface-400"
            }`}>
              {ratingLabels[b.rating]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Dilution Stacked Bar ─────────────────────────────────────────────────────

function DilutionChart({ data }: { data: Record<string, unknown> }) {
  const capTable = data.capTable as {
    preRound: { founders: number; previousInvestors: number };
    postRound: { founders: number; previousInvestors: number; newInvestor: number; optionPool: number };
  };
  if (!capTable) return null;

  const segments = [
    { label: "Founders", value: capTable.postRound.founders, color: "#3B82F6" },
    { label: "Prev Investors", value: capTable.postRound.previousInvestors, color: "#8B5CF6" },
    { label: "New Investor", value: capTable.postRound.newInvestor, color: "#10B981" },
    ...(capTable.postRound.optionPool > 0
      ? [{ label: "Option Pool", value: capTable.postRound.optionPool, color: "#F59E0B" }]
      : []),
  ].filter((s) => s.value > 0.001);

  const round = data.roundDetails as { roundAmount: number; preMoneyValuation: number; postMoneyValuation: number };

  return (
    <div className="mt-2 rounded-lg border border-surface-200 bg-surface-0 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">Cap Table Post-Round</span>
        <span className="text-[10px] text-surface-400">${formatCompact(round.postMoneyValuation)} post</span>
      </div>
      {/* Stacked bar */}
      <div className="h-6 rounded-full overflow-hidden flex">
        {segments.map((s) => (
          <div
            key={s.label}
            className="h-full transition-all"
            style={{ width: `${s.value * 100}%`, backgroundColor: s.color }}
            title={`${s.label}: ${(s.value * 100).toFixed(1)}%`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[9px] text-surface-600">{s.label} {(s.value * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}
