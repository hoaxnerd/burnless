"use client";

import { useState } from "react";
import { Pencil, Check } from "lucide-react";
import type { Settings2, Clock } from "lucide-react";

/* ── AssumptionRow ──────────────────────────────────────────────────────── */

export function AssumptionRow({
  label,
  value,
  format,
  onChange,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const startEdit = () => {
    setEditValue(String(value));
    setEditing(true);
  };

  const commitEdit = () => {
    const parsed = Number(editValue);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between px-5 py-3 hover:bg-surface-50 transition-colors group">
      <span className="text-sm text-surface-600">{label}</span>
      <div className="flex items-center gap-2">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
              className="w-24 rounded-lg border border-brand-500 bg-surface-0 px-2 py-1 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <button
              onClick={commitEdit}
              className="rounded-md p-1 text-success-600 hover:bg-success-50 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <span className="text-sm font-semibold text-surface-900 tabular-nums">
              {format(value)}
            </span>
            <button
              onClick={startEdit}
              className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-all"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── StatCard ───────────────────────────────────────────────────────────── */

export function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Settings2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-surface-0 border border-surface-200 p-4 flex items-center gap-3">
      <div className="rounded-lg bg-surface-50 p-2">
        <Icon className="h-4 w-4 text-surface-500" />
      </div>
      <div>
        <p className="text-xs text-surface-500">{label}</p>
        <p className="text-sm font-semibold text-surface-900 tabular-nums">{value}</p>
      </div>
    </div>
  );
}

/* ── KpiCard ────────────────────────────────────────────────────────────── */

export function KpiCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: string;
  color: "success" | "danger" | "warning";
  icon: typeof Clock;
}) {
  const colorMap = {
    success: "border-l-success-500 bg-success-50/30",
    danger: "border-l-danger-500 bg-danger-50/30",
    warning: "border-l-warning-500 bg-warning-50/30",
  };
  const textColor = {
    success: "text-success-700",
    danger: "text-danger-700",
    warning: "text-warning-700",
  };

  return (
    <div className={`rounded-xl border border-surface-200 border-l-4 ${colorMap[color]} p-4`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`h-3.5 w-3.5 ${textColor[color]}`} />
        <p className="text-xs text-surface-500">{label}</p>
      </div>
      <p className={`text-lg font-bold tabular-nums ${textColor[color]}`}>{value}</p>
    </div>
  );
}

/* ── SliderInput ────────────────────────────────────────────────────────── */

export function SliderInput({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-surface-600">{label}</label>
        <span className="text-xs font-semibold text-surface-900 tabular-nums">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-surface-200 rounded-full appearance-none cursor-pointer accent-brand-600
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-600 [&::-webkit-slider-thumb]:border-2
          [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
      />
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-surface-400">{format(min)}</span>
        <span className="text-[10px] text-surface-400">{format(max)}</span>
      </div>
    </div>
  );
}
