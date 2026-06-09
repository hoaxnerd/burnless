"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Sparkles,
  TrendingDown,
  TrendingUp,
  LayoutDashboard,
  Receipt,
  Landmark,
  Users,
  AlertTriangle,
} from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { BrandLogo } from "@/components/brand-logo";

/* Workbench hero — the product is the proof. Left-biased type column + a
   faithful snapshot of the real dashboard (floating sidebar + KPI cards + AI
   insight banner + cash-flow chart), built from the app's own class patterns.
   One focal brand glow (.landing-glow) sits behind it. The panel's
   "analysing → insight" reveal and the in-app toast make the agentic posture
   visible, not just stated. No re-drawn browser chrome. */

const cashFlowBars = [62, 55, 70, 48, 58, 66, 74, 60, 78, 84, 72, 90];
const recentThreshold = 4; // last 8 of 12 bars read brand-blue

const sidebarNav = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Sparkles, label: "Companion", ai: true },
  { icon: TrendingUp, label: "Revenue" },
  { icon: Receipt, label: "Expenses" },
  { icon: Landmark, label: "Funding" },
  { icon: Users, label: "Team" },
];

const kpis = [
  { label: "Runway", value: "18.2 mo", change: "+1.4", changeTone: "text-success-600", icon: TrendingUp, iconTone: "text-success-500" },
  { label: "Net burn", value: "$42.5K", change: "−12%", changeTone: "text-success-600", icon: TrendingDown, iconTone: "text-orange-500" },
  { label: "MRR", value: "$28.3K", change: "+8%", changeTone: "text-success-600", icon: TrendingUp, iconTone: "text-brand-500" },
];

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function ProductPanel() {
  // Live "watching" cue: the panel analyses, then surfaces an insight.
  const [analyzed, setAnalyzed] = useState(false);

  useEffect(() => {
    // Reduced-motion users skip the 1.9s reveal delay and see the insight
    // immediately; everyone else gets the timed "analysing → insight" reveal.
    // Both branches schedule the setState via a timer (0ms vs 1900ms) so the
    // update never runs synchronously in the effect body (react-compiler:
    // "Calling setState synchronously within an effect").
    const delay = prefersReducedMotion() ? 0 : 1900;
    const t = setTimeout(() => setAnalyzed(true), delay);
    return () => clearTimeout(t);
  }, []);

  return (
    <figure
      className="relative m-0"
      style={{ animation: "slideUp 0.7s var(--ease-smooth) 0.35s both" }}
    >
      {/* The one focal moment — a single controlled brand glow behind the panel */}
      <div className="landing-glow pointer-events-none absolute -inset-8 -z-10" aria-hidden="true" />

      {/* App frame — mirrors the dashboard shell canvas */}
      <div className="relative flex overflow-hidden rounded-2xl border border-surface-200 bg-surface-100/70 shadow-xl">
        {/* Floating sidebar (real shell style: rounded card, brand-active item) */}
        <aside className="hidden w-44 shrink-0 p-2.5 md:block">
          <div className="flex h-full flex-col rounded-2xl border border-surface-200/60 bg-surface-0 p-2.5 shadow-sm">
            <div className="flex items-center gap-1.5 px-1.5 py-1.5">
              <BrandLogo className="h-6 w-6" />
              <span className="text-sm font-semibold tracking-tight text-surface-900">burnless</span>
            </div>
            <nav className="mt-3 space-y-0.5">
              {sidebarNav.map((item) => {
                // AI Companion sits directly under Dashboard, in the accent register.
                const cls = item.ai
                  ? "flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-accent-500/[0.08] to-transparent px-2.5 py-1.5 text-xs font-medium text-accent-600"
                  : `flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium ${
                      item.active ? "bg-brand-50 text-brand-700 shadow-sm" : "text-surface-600"
                    }`;
                const iconCls = item.ai
                  ? "text-accent-500"
                  : item.active
                    ? "text-brand-600"
                    : "text-surface-400";
                return (
                  <div key={item.label} className={cls}>
                    <item.icon className={`h-3.5 w-3.5 ${iconCls}`} />
                    {item.label}
                  </div>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main content area */}
        <div className="min-w-0 flex-1 space-y-3 p-3.5">
          {/* KPI cards — real hero-kpi-card styling */}
          <div className="grid grid-cols-3 gap-2.5">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-surface-200 bg-surface-0 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-surface-400">
                    {kpi.label}
                  </span>
                  <kpi.icon className={`h-3.5 w-3.5 ${kpi.iconTone}`} />
                </div>
                <div className="mt-1.5 font-mono text-base font-bold leading-none tabular-nums text-surface-900">
                  {kpi.value}
                </div>
                <div className={`mt-1.5 text-[10px] font-semibold ${kpi.changeTone}`}>
                  {kpi.change} <span className="font-normal text-surface-400">vs last mo</span>
                </div>
              </div>
            ))}
          </div>

          {/* AI insight banner — sits above the chart, below the KPIs (real dashboard order).
              Live analyse → insight reveal. */}
          <div className="rounded-2xl border border-brand-500/20 bg-brand-50/50 p-3">
            <div className="flex items-start gap-2.5">
              <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-xl bg-brand-500/10 opacity-20" aria-hidden="true" />
                <span className="relative flex h-7 w-7 items-center justify-center rounded-xl bg-brand-500/10">
                  <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                </span>
              </span>
              <div className="min-w-0">
                <div className="text-[9px] font-medium uppercase tracking-widest text-surface-400">
                  AI insight
                </div>
                {analyzed ? (
                  <p
                    className="mt-0.5 text-[11px] leading-relaxed text-surface-700"
                    style={{ animation: "fadeIn 0.45s var(--ease-smooth) both" }}
                  >
                    Burn fell <span className="font-mono font-semibold text-success-600">12%</span> this
                    month. At the current pace your runway extends to{" "}
                    <span className="font-semibold text-surface-900">Sep 2027</span>.
                  </p>
                ) : (
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-surface-400">
                    Analysing your numbers
                    <span className="inline-flex gap-0.5">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="h-1 w-1 rounded-full bg-brand-400"
                          style={{ animation: "typingCursor 1.2s ease-in-out infinite", animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Chart card */}
          <div className="rounded-2xl border border-surface-200 bg-surface-0 p-3.5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-surface-900">Cash flow</div>
                <div className="text-[10px] text-surface-400">Last 12 months</div>
              </div>
              <span className="font-mono text-[10px] font-semibold text-success-600">+14% MoM</span>
            </div>
            <div className="flex h-20 items-end gap-1.5" aria-hidden="true">
              {cashFlowBars.map((h, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-t-sm ${i >= recentThreshold ? "bg-brand-500" : "bg-surface-300"}`}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* In-app toast — a proactive alert with real content, pinned to the
            bottom-right corner of the dashboard, surfaced unprompted. */}
        <div
          className="absolute bottom-4 right-4 z-10 w-52 rounded-xl border border-surface-200 bg-surface-0 p-2.5 shadow-lg"
          style={{ animation: "toastIn 0.45s var(--ease-smooth) 2.7s both" }}
        >
          <div className="flex items-start gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-warning-50">
              <AlertTriangle className="h-3 w-3 text-warning-600" />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold leading-tight text-surface-900">Burn anomaly</div>
              <p className="mt-0.5 text-[10px] leading-relaxed text-surface-500">
                AWS up <span className="font-mono font-semibold text-warning-600">38%</span> vs last
                month — likely a new service.
              </p>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pb-20 pt-28 sm:pb-24 sm:pt-32">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-8">
        {/* Type column */}
        <div className="lg:col-span-5">
          <p
            className="inline-flex items-center gap-2 rounded-full border border-surface-200 bg-surface-50 px-3 py-1 text-xs font-medium text-surface-600"
            style={{ animation: "slideUp 0.6s var(--ease-smooth) 0.05s both" }}
          >
            <TrendingDown className="h-3.5 w-3.5 text-brand-600" />
            Financial intelligence for startups
          </p>

          <h1
            className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight text-surface-900 sm:text-5xl lg:text-6xl"
            style={{ animation: "slideUp 0.6s var(--ease-smooth) 0.12s both" }}
          >
            Know your{" "}
            <span className="text-brand-600 underline decoration-brand-300 decoration-[3px] underline-offset-[6px]">
              runway
            </span>
            .
            <br />
            Before you have to ask.
          </h1>

          <p
            className="mt-6 max-w-md text-lg leading-relaxed text-surface-600"
            style={{ animation: "slideUp 0.6s var(--ease-smooth) 0.2s both" }}
          >
            burnless watches your revenue, burn, and funding in real time — then tells
            you what’s changing, what’s at risk, and what to do next.
          </p>

          <div
            className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
            style={{ animation: "slideUp 0.6s var(--ease-smooth) 0.28s both" }}
          >
            <Link
              href="/login"
              onClick={() => trackEvent("landing_hero_cta_clicked")}
              className="press-effect group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-brand-600 px-7 py-3.5 text-base font-semibold text-white shadow-md transition-colors hover:bg-brand-700"
            >
              Start free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="#companion"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-surface-300 px-7 py-3.5 text-base font-medium text-surface-700 transition-colors hover:border-surface-400 hover:bg-surface-50"
            >
              See it think
            </Link>
          </div>
        </div>

        {/* Product column */}
        <div className="lg:col-span-7">
          <ProductPanel />
        </div>
      </div>
    </section>
  );
}
