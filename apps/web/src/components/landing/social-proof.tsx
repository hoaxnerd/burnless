"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { TrendingUp, DollarSign, Zap } from "lucide-react";
import { useInView } from "./use-in-view";

/* ── Integration data with brand colors ──────────────────────────────────── */

const integrations = [
  { name: "QuickBooks", letters: "QB", color: "#2CA01C" },
  { name: "Xero", letters: "XE", color: "#13B5EA" },
  { name: "Plaid", letters: "PL", color: "#111111" },
  { name: "Mercury", letters: "ME", color: "#5730EF" },
  { name: "Stripe", letters: "ST", color: "#635BFF" },
  { name: "Gusto", letters: "GU", color: "#F45D48" },
  { name: "Brex", letters: "BX", color: "#FF5733" },
  { name: "Ramp", letters: "RA", color: "#00C853" },
];

/* ── Animated counter hook ───────────────────────────────────────────────── */

function useCounter(target: number, duration: number, active: boolean) {
  const [count, setCount] = useState(0);
  const hasRun = useRef(false);

  useEffect(() => {
    if (!active || hasRun.current) return;
    hasRun.current = true;

    const startTime = performance.now();
    let rafId: number;

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration, active]);

  return count;
}

/* ── Stat card ───────────────────────────────────────────────────────────── */

function StatCard({
  icon: Icon,
  value: _value,
  suffix,
  prefix,
  label,
  target,
  active,
  delay,
}: {
  icon: React.ElementType;
  value?: string;
  suffix: string;
  prefix: string;
  label: string;
  target: number;
  active: boolean;
  delay: number;
}) {
  const count = useCounter(target, 2000, active);

  return (
    <div
      className={`flex flex-col items-center gap-2 transition-all duration-700`}
      style={{
        transitionDelay: `${delay}ms`,
        opacity: active ? 1 : 0,
        transform: active ? "translateY(0)" : "translateY(20px)",
      }}
    >
      <div className="w-10 h-10 rounded-xl bg-highlight-500/10 border border-highlight-500/20 flex items-center justify-center mb-1">
        <Icon className="w-5 h-5 text-highlight-500" />
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-surface-900 font-mono tabular-nums tracking-tight">
        {prefix}
        {count.toLocaleString()}
        {suffix}
      </div>
      <div className="text-sm text-surface-500">{label}</div>
    </div>
  );
}

/* ── Logo pill with brand color ──────────────────────────────────────────── */

function LogoPill({
  name,
  letters,
  color,
}: {
  name: string;
  letters: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-surface-200/10 border border-surface-200/15 shrink-0 transition-all duration-300 hover:bg-surface-200/20 hover:border-surface-200/30 hover:-translate-y-0.5">
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold font-mono text-white"
        style={{ backgroundColor: color }}
      >
        {letters}
      </div>
      <span className="text-sm font-medium text-surface-500 whitespace-nowrap">
        {name}
      </span>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export function SocialProofBar() {
  const { ref, inView } = useInView();
  const [hovered, setHovered] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => setHovered(true), []);
  const handleMouseLeave = useCallback(() => setHovered(false), []);

  return (
    <section
      ref={ref}
      className="relative py-16 sm:py-20 border-y border-surface-200/20 overflow-hidden"
    >
      {/* Stats row */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 mb-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-4">
          <StatCard
            icon={TrendingUp}
            target={2400}
            prefix=""
            suffix="+"
            label="Financial decisions powered"
            active={inView}
            delay={0}
          />
          <StatCard
            icon={DollarSign}
            target={150}
            prefix="$"
            suffix="M+"
            label="In runway tracked"
            active={inView}
            delay={150}
          />
          <StatCard
            icon={Zap}
            target={40}
            prefix=""
            suffix="+"
            label="Integrations available"
            active={inView}
            delay={300}
          />
        </div>
      </div>

      {/* "Trusted by" label */}
      <div
        className={`text-center mb-8 transition-all duration-700 ${
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
        style={{ transitionDelay: "400ms" }}
      >
        <p className="text-sm font-medium uppercase tracking-wider text-surface-500">
          Trusted by founders using the tools they love
        </p>
      </div>

      {/* Infinite scroll logos — pause on hover */}
      <div
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-r from-surface-0 to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-l from-surface-0 to-transparent z-10 pointer-events-none" />

        <div
          ref={scrollRef}
          className="flex gap-4"
          style={{
            animationName: inView ? "logoScroll" : "none",
            animationDuration: "35s",
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
            animationPlayState: hovered ? "paused" : "running",
            width: "max-content",
          }}
        >
          {/* Triple the logos for a seamless loop on wide screens */}
          {[...integrations, ...integrations, ...integrations].map(
            (logo, i) => (
              <LogoPill
                key={`${logo.name}-${i}`}
                name={logo.name}
                letters={logo.letters}
                color={logo.color}
              />
            )
          )}
        </div>
      </div>
    </section>
  );
}
