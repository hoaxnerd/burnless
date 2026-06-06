"use client";

import { useEffect, useState } from "react";
import { Bot, Gauge, Send, TrendingUp } from "lucide-react";

/* Product visuals for the feature tour. All colour routes through the design
   system's semantic tokens (var(--color-*)) — no hardcoded hex. */

/* ─────────────────────────────────────────────
   AI Chat Mockup — shows a mini conversation
   ───────────────────────────────────────────── */

export function AIChatMockup({ visible }: { visible: boolean }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const timers = [
      setTimeout(() => setStage(1), 400),
      setTimeout(() => setStage(2), 1400),
      setTimeout(() => setStage(3), 2600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [visible]);

  return (
    <div className="overflow-hidden rounded-xl border border-surface-200 bg-surface-0 shadow-sm">
      {/* Chat header */}
      <div className="flex items-center gap-2.5 border-b border-surface-200 bg-surface-50 px-4 py-2.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-100">
          <Bot className="h-3 w-3 text-accent-600" />
        </div>
        <span className="text-xs font-semibold text-surface-900">burnless AI</span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-success-600">
          <span className="h-1 w-1 rounded-full bg-success-500" />
          Online
        </span>
      </div>

      {/* Messages */}
      <div className="min-h-[180px] space-y-3 p-3.5">
        {stage >= 1 && (
          <div
            className="flex justify-end"
            style={{ animation: "fadeSlideIn 0.4s var(--ease-smooth, ease-out) both" }}
          >
            <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-brand-600 px-3 py-2 text-xs text-white">
              When do we need to fundraise?
            </div>
          </div>
        )}

        {stage === 2 && (
          <div
            className="flex items-start gap-2"
            style={{ animation: "fadeSlideIn 0.3s var(--ease-smooth, ease-out) both" }}
          >
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-100">
              <Bot className="h-2.5 w-2.5 text-accent-600" />
            </div>
            <div className="flex gap-1 rounded-xl rounded-tl-sm border border-surface-200 bg-surface-50 px-3 py-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-1 w-1 rounded-full bg-accent-500"
                  style={{
                    animation: "typingCursor 1.2s ease-in-out infinite",
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {stage >= 3 && (
          <div
            className="flex items-start gap-2"
            style={{ animation: "fadeSlideIn 0.4s var(--ease-smooth, ease-out) both" }}
          >
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-100">
              <Bot className="h-2.5 w-2.5 text-accent-600" />
            </div>
            <div className="max-w-[90%] rounded-xl rounded-tl-sm border border-surface-200 bg-surface-50 px-3 py-2">
              <p className="text-xs leading-relaxed text-surface-900">
                At your current burn of{" "}
                <span className="font-mono font-semibold text-brand-600">$42.5K/mo</span>, you have{" "}
                <span className="font-mono font-semibold text-success-600">18.2 months</span> of
                runway. I&rsquo;d start fundraising by{" "}
                <span className="font-semibold text-warning-600">Q3 2026</span> to keep a 6-month
                buffer.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-surface-200 bg-surface-50 px-3.5 py-2.5">
        <div className="flex items-center gap-2 rounded-lg border border-surface-200 bg-surface-0 px-3 py-1.5">
          <span className="flex-1 text-[11px] text-surface-400">Ask anything…</span>
          <Send className="h-3 w-3 text-brand-600" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Runway Gauge — animated meter with zones
   ───────────────────────────────────────────── */

const zones = [
  { label: "Critical", range: "0–6mo", color: "var(--color-danger-500)" },
  { label: "Caution", range: "6–12mo", color: "var(--color-warning-500)" },
  { label: "Healthy", range: "12–18mo", color: "var(--color-success-500)" },
  { label: "Strong", range: "18mo+", color: "var(--color-brand-500)" },
];

export function RunwayGauge({ visible }: { visible: boolean }) {
  const [fillPercent, setFillPercent] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setFillPercent(76), 300);
    return () => clearTimeout(timer);
  }, [visible]);

  const months = 18.2;

  return (
    <div className="rounded-xl border border-surface-200 bg-surface-0 p-5 shadow-sm">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-surface-500" />
          <span className="text-xs font-semibold uppercase tracking-wide text-surface-900">
            Runway status
          </span>
        </div>
        <span className="font-mono text-[10px] text-surface-500">Updated just now</span>
      </div>

      {/* Big number */}
      <div className="mb-5 text-center">
        <div
          className="font-mono text-4xl font-bold tabular-nums text-surface-900 transition-all duration-1000"
          style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(8px)" }}
        >
          {visible ? months.toFixed(1) : "0.0"}
        </div>
        <div className="mt-1 text-xs text-surface-500">months of runway</div>
      </div>

      {/* Gauge bar */}
      <div className="relative mb-3">
        <div className="flex h-3 overflow-hidden rounded-full bg-surface-100">
          {zones.map((zone) => (
            <div
              key={zone.label}
              className="h-full w-1/4"
              style={{ backgroundColor: `color-mix(in srgb, ${zone.color} 14%, transparent)` }}
            />
          ))}
        </div>

        {/* Fill bar */}
        <div
          className="absolute left-0 top-0 h-3 rounded-full"
          style={{
            width: `${fillPercent}%`,
            background:
              "linear-gradient(90deg, var(--color-danger-500), var(--color-warning-500) 33%, var(--color-success-500) 66%, var(--color-brand-500))",
            transition: "width 1.5s var(--ease-smooth)",
          }}
        />

        {/* Needle */}
        <div
          className="absolute top-[-3px]"
          style={{
            left: `${fillPercent}%`,
            transform: "translateX(-50%)",
            transition: "left 1.5s var(--ease-smooth)",
          }}
        >
          <div className="h-3 w-3 rounded-full border-2 border-brand-600 bg-surface-0 shadow-md" />
        </div>
      </div>

      {/* Zone labels */}
      <div className="mt-1 flex text-[9px] font-medium">
        {zones.map((zone) => (
          <div key={zone.label} className="flex-1 text-center" style={{ color: zone.color }}>
            {zone.range}
          </div>
        ))}
      </div>

      {/* Status chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1">
          <span className="h-1 w-1 rounded-full bg-success-500" />
          <span className="text-[10px] font-medium text-success-700">Healthy</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-surface-200 px-2.5 py-1">
          <TrendingUp className="h-2.5 w-2.5 text-surface-500" />
          <span className="text-[10px] text-surface-500">Burn down 12%</span>
        </div>
      </div>
    </div>
  );
}
