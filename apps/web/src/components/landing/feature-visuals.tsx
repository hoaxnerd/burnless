"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  Gauge,
  Send,
  TrendingUp,
} from "lucide-react";

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
    <div className="rounded-xl border border-surface-200/20 bg-surface-0/40 backdrop-blur-sm overflow-hidden shadow-lg">
      {/* Chat header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-surface-200/15 bg-surface-100/5">
        <div className="w-6 h-6 rounded-full bg-accent-500/20 flex items-center justify-center">
          <Bot className="w-3 h-3 text-accent-400" />
        </div>
        <span className="text-xs font-semibold text-surface-900">Burnless AI</span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-success-500">
          <span className="w-1 h-1 rounded-full bg-success-500" />
          Online
        </span>
      </div>

      {/* Messages */}
      <div className="p-3.5 space-y-3 min-h-[180px]">
        {/* User message */}
        {stage >= 1 && (
          <div
            className="flex justify-end"
            style={{ animation: "fadeSlideIn 0.4s var(--ease-smooth, ease-out) both" }}
          >
            <div className="rounded-xl rounded-tr-sm bg-brand-500 px-3 py-2 text-xs text-white max-w-[85%]">
              When do we need to fundraise?
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {stage === 2 && (
          <div
            className="flex items-start gap-2"
            style={{ animation: "fadeSlideIn 0.3s var(--ease-smooth, ease-out) both" }}
          >
            <div className="w-5 h-5 rounded-full bg-accent-500/15 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-2.5 h-2.5 text-accent-400" />
            </div>
            <div className="rounded-xl rounded-tl-sm bg-surface-200/10 border border-surface-200/15 px-3 py-2 flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1 h-1 rounded-full bg-accent-400"
                  style={{
                    animation: "typingCursor 1.2s ease-in-out infinite",
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* AI response */}
        {stage >= 3 && (
          <div
            className="flex items-start gap-2"
            style={{ animation: "fadeSlideIn 0.4s var(--ease-smooth, ease-out) both" }}
          >
            <div className="w-5 h-5 rounded-full bg-accent-500/15 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-2.5 h-2.5 text-accent-400" />
            </div>
            <div className="rounded-xl rounded-tl-sm bg-surface-200/10 border border-surface-200/15 px-3 py-2 max-w-[90%]">
              <p className="text-xs text-surface-900 leading-relaxed">
                At your current burn of <span className="font-semibold text-brand-400 font-mono">$42.5K/mo</span>, you have{" "}
                <span className="font-semibold text-success-500 font-mono">18.2 months</span> of runway.
                I recommend starting fundraising by{" "}
                <span className="font-semibold text-warning-500">Q3 2026</span> to maintain a 6-month buffer.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="px-3.5 py-2.5 border-t border-surface-200/15 bg-surface-100/5">
        <div className="flex items-center gap-2 rounded-lg bg-surface-200/8 border border-surface-200/12 px-3 py-1.5">
          <span className="text-[11px] text-surface-400 flex-1">Ask anything...</span>
          <Send className="w-3 h-3 text-brand-400" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Runway Gauge — animated meter with zones
   ───────────────────────────────────────────── */

export function RunwayGauge({ visible }: { visible: boolean }) {
  const [fillPercent, setFillPercent] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setFillPercent(76), 300);
    return () => clearTimeout(timer);
  }, [visible]);

  const months = 18.2;
  const zones = [
    { label: "Critical", range: "0-6mo", color: "#ef4444", width: "25%" },
    { label: "Caution", range: "6-12mo", color: "#f59e0b", width: "25%" },
    { label: "Healthy", range: "12-18mo", color: "#10b981", width: "25%" },
    { label: "Strong", range: "18mo+", color: "#3b82f6", width: "25%" },
  ];

  return (
    <div className="rounded-xl border border-surface-200/20 bg-surface-0/40 backdrop-blur-sm p-5 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-surface-500" />
          <span className="text-xs font-semibold text-surface-900 uppercase tracking-wider">Runway Status</span>
        </div>
        <span className="text-[10px] text-surface-500 font-mono">Updated just now</span>
      </div>

      {/* Big number */}
      <div className="text-center mb-5">
        <div
          className="text-4xl font-bold font-mono tabular-nums text-surface-900 transition-all duration-1000"
          style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(8px)" }}
        >
          {visible ? months.toFixed(1) : "0.0"}
        </div>
        <div className="text-xs text-surface-500 mt-1">months of runway</div>
      </div>

      {/* Gauge bar */}
      <div className="relative mb-3">
        {/* Zone background */}
        <div className="flex rounded-full overflow-hidden h-3 bg-surface-200/10">
          {zones.map((zone) => (
            <div
              key={zone.label}
              className="h-full"
              style={{ width: zone.width, backgroundColor: `${zone.color}20` }}
            />
          ))}
        </div>

        {/* Fill bar */}
        <div
          className="absolute top-0 left-0 h-3 rounded-full transition-all duration-1500 ease-out"
          style={{
            width: `${fillPercent}%`,
            background: "linear-gradient(90deg, #ef4444, #f59e0b 33%, #10b981 66%, #3b82f6)",
            transitionDuration: "1.5s",
          }}
        />

        {/* Needle */}
        <div
          className="absolute top-[-3px] transition-all ease-out"
          style={{
            left: `${fillPercent}%`,
            transform: "translateX(-50%)",
            transitionDuration: "1.5s",
          }}
        >
          <div className="w-3 h-3 rounded-full bg-white border-2 border-brand-500 shadow-md shadow-brand-500/30" />
        </div>
      </div>

      {/* Zone labels */}
      <div className="flex text-[9px] font-medium mt-1">
        {zones.map((zone) => (
          <div key={zone.label} className="flex-1 text-center" style={{ color: zone.color }}>
            {zone.range}
          </div>
        ))}
      </div>

      {/* Status chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5 rounded-full bg-success-500/10 border border-success-500/20 px-2.5 py-1">
          <span className="w-1 h-1 rounded-full bg-success-500" />
          <span className="text-[10px] font-medium text-success-500">Healthy</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-surface-200/10 border border-surface-200/15 px-2.5 py-1">
          <TrendingUp className="w-2.5 h-2.5 text-surface-500" />
          <span className="text-[10px] text-surface-500">Burn down 12%</span>
        </div>
      </div>
    </div>
  );
}
