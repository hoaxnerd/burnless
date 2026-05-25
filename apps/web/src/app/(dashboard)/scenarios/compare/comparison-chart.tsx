"use client";

import type { CurrencyCode } from "@burnless/types";
import type { ComparisonLine } from "./comparison-types";
import { formatCurrency, formatMonth } from "./comparison-types";

/** SVG dual-line chart with green/red delta shading between the two scenarios. */
export function ComparisonChart({
  line,
  baseName,
  compareName,
  isCurrency,
  positiveIsGood,
  currency,
}: {
  line: ComparisonLine;
  baseName: string;
  compareName: string;
  isCurrency: boolean;
  positiveIsGood: boolean;
  currency: CurrencyCode;
}) {
  const width = 500;
  const height = 200;
  const pad = { top: 20, right: 16, bottom: 30, left: 56 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const n = line.baseValues.length;

  if (n === 0) return null;

  const allVals = [...line.baseValues.map((v) => v.value), ...line.compareValues.map((v) => v.value)];
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;

  const x = (i: number) => pad.left + (i / Math.max(n - 1, 1)) * chartW;
  const y = (v: number) => pad.top + (1 - (v - minV) / range) * chartH;

  const basePts = line.baseValues.map((v, i) => ({ x: x(i), y: y(v.value) }));
  const compPts = line.compareValues.map((v, i) => ({ x: x(i), y: y(v.value) }));

  const baseLine = basePts.map((p) => `${p.x},${p.y}`).join(" ");
  const compLine = compPts.map((p) => `${p.x},${p.y}`).join(" ");

  // Delta fill — clip path between the two lines, colored green or red depending on which is better
  const deltaSegments: React.ReactNode[] = [];
  for (let i = 0; i < n - 1; i++) {
    const delta = line.deltaAbsolute[i]?.value ?? 0;
    const isGood = positiveIsGood ? delta >= 0 : delta <= 0;
    const fill = delta === 0 ? "transparent" : isGood ? "#22c55e" : "#ef4444";
    const pathD = `M${basePts[i]!.x},${basePts[i]!.y} L${basePts[i + 1]!.x},${basePts[i + 1]!.y} L${compPts[i + 1]!.x},${compPts[i + 1]!.y} L${compPts[i]!.x},${compPts[i]!.y} Z`;
    deltaSegments.push(
      <path key={i} d={pathD} fill={fill} opacity={0.12} />
    );
  }

  const fmt = (v: number) => isCurrency ? formatCurrency(v, currency, undefined, { compact: true }) : String(Math.round(v));

  return (
    <div className="rounded-xl bg-surface-0 border border-surface-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-surface-900">{line.name}</h3>
        <div className="flex items-center gap-4 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded bg-blue-500" />
            {baseName}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded bg-amber-500" />
            {compareName}
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${line.name} comparison chart: ${baseName} vs ${compareName}`}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const yPos = pad.top + (1 - pct) * chartH;
          const val = minV + pct * range;
          return (
            <g key={pct}>
              <line x1={pad.left} y1={yPos} x2={width - pad.right} y2={yPos} stroke="var(--color-surface-100)" strokeWidth="1" />
              <text x={pad.left - 6} y={yPos + 3} textAnchor="end" fill="var(--color-surface-400)" fontSize="8">
                {fmt(val)}
              </text>
            </g>
          );
        })}

        {/* Delta shading between lines */}
        {deltaSegments}

        {/* Base line */}
        <polyline points={baseLine} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
        {/* Compare line */}
        <polyline points={compLine} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" strokeDasharray="6,3" />

        {/* X-axis labels */}
        {line.baseValues
          .filter((_, i) => n <= 6 || i % Math.ceil(n / 6) === 0 || i === n - 1)
          .map((v) => {
            const i = line.baseValues.indexOf(v);
            return (
              <text key={v.month} x={x(i)} y={height - 6} textAnchor="middle" fill="var(--color-surface-400)" fontSize="8">
                {formatMonth(v.month)}
              </text>
            );
          })}

        {/* Endpoint dots */}
        <circle cx={basePts[n - 1]!.x} cy={basePts[n - 1]!.y} r={3} fill="#3b82f6" />
        <circle cx={compPts[n - 1]!.x} cy={compPts[n - 1]!.y} r={3} fill="#f59e0b" />
      </svg>
    </div>
  );
}
