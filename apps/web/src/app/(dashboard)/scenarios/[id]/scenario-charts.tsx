"use client";

import { formatCurrency } from "./scenario-utils";

/* ── RunwayChart ────────────────────────────────────────────────────────── */

/** SVG-based runway chart — no heavy deps. */
export function RunwayChart({
  series,
  runwayMonth,
}: {
  series: { month: number; label: string; cash: number }[];
  runwayMonth: number | null;
}) {
  const width = 700;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxCash = Math.max(...series.map((s) => s.cash), 0);
  const minCash = Math.min(...series.map((s) => s.cash), 0);
  const range = maxCash - minCash || 1;

  const scaleX = (i: number) => padding.left + (i / (series.length - 1)) * chartW;
  const scaleY = (v: number) => padding.top + (1 - (v - minCash) / range) * chartH;

  const zeroY = scaleY(0);
  const points = series.map((s, i) => `${scaleX(i)},${scaleY(s.cash)}`).join(" ");

  const areaPath = `M${scaleX(0)},${zeroY} ${series.map((s, i) => `L${scaleX(i)},${scaleY(s.cash)}`).join(" ")} L${scaleX(series.length - 1)},${zeroY} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Zero line */}
      {minCash < 0 && (
        <line
          x1={padding.left} y1={zeroY} x2={width - padding.right} y2={zeroY}
          stroke="var(--color-surface-300)" strokeDasharray="4,4" strokeWidth="1"
        />
      )}
      {/* Area fill */}
      <path d={areaPath} fill="url(#cashGradient)" />
      {/* Line */}
      <polyline points={points} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" />
      {/* Runway marker */}
      {runwayMonth !== null && runwayMonth < series.length && (
        <>
          <line
            x1={scaleX(runwayMonth)} y1={padding.top} x2={scaleX(runwayMonth)} y2={height - padding.bottom}
            stroke="#ef4444" strokeDasharray="4,4" strokeWidth="1.5"
          />
          <text
            x={scaleX(runwayMonth)} y={padding.top - 5} textAnchor="middle"
            fill="#ef4444" fontSize="10" fontWeight="600"
          >
            Cash = $0
          </text>
        </>
      )}
      {/* Y-axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const v = minCash + pct * range;
        return (
          <text key={pct} x={padding.left - 6} y={scaleY(v) + 3} textAnchor="end" fill="var(--color-surface-400)" fontSize="9">
            {formatCurrency(v, "USD", undefined, { compact: true })}
          </text>
        );
      })}
      {/* X-axis labels */}
      {series.filter((_, i) => i % 3 === 0).map((s, idx) => (
        <text key={idx} x={scaleX(s.month)} y={height - 8} textAnchor="middle" fill="var(--color-surface-400)" fontSize="9">
          {s.label}
        </text>
      ))}
    </svg>
  );
}

/* ── RevenueBurnChart ───────────────────────────────────────────────────── */

/** Revenue vs Burn bar chart. */
export function RevenueBurnChart({
  series,
}: {
  series: { month: number; label: string; revenue: number; burn: number }[];
}) {
  const width = 700;
  const height = 180;
  const padding = { top: 15, right: 20, bottom: 30, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(...series.map((s) => Math.max(s.revenue, s.burn)));
  const barGroupW = chartW / series.length;
  const barW = barGroupW * 0.35;

  const scaleY = (v: number) => padding.top + (1 - v / (maxVal || 1)) * chartH;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {series.map((s, i) => {
        const x = padding.left + i * barGroupW;
        return (
          <g key={i}>
            <rect
              x={x + barGroupW * 0.1} y={scaleY(s.revenue)}
              width={barW} height={chartH + padding.top - scaleY(s.revenue)}
              rx={2} fill="#3b82f6" opacity={0.8}
            />
            <rect
              x={x + barGroupW * 0.1 + barW + 2} y={scaleY(s.burn)}
              width={barW} height={chartH + padding.top - scaleY(s.burn)}
              rx={2} fill="#ef4444" opacity={0.6}
            />
            {i % 3 === 0 && (
              <text x={x + barGroupW / 2} y={height - 8} textAnchor="middle" fill="var(--color-surface-400)" fontSize="9">
                {s.label}
              </text>
            )}
          </g>
        );
      })}
      {/* Y-axis */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const v = pct * maxVal;
        return (
          <text key={pct} x={padding.left - 6} y={scaleY(v) + 3} textAnchor="end" fill="var(--color-surface-400)" fontSize="9">
            {formatCurrency(v, "USD", undefined, { compact: true })}
          </text>
        );
      })}
      {/* Inline legend */}
      <circle cx={width - 130} cy={10} r={4} fill="#3b82f6" opacity={0.8} />
      <text x={width - 122} y={14} fill="var(--color-surface-500)" fontSize="9">Revenue</text>
      <circle cx={width - 64} cy={10} r={4} fill="#ef4444" opacity={0.6} />
      <text x={width - 56} y={14} fill="var(--color-surface-500)" fontSize="9">Burn</text>
    </svg>
  );
}
