"use client";

import Link from "next/link";
import { Shield, Lock, Globe } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

function MeshGradient() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Base dark */}
      <div className="absolute inset-0 bg-surface-0" />

      {/* Animated gradient orbs */}
      <div
        className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full opacity-30 blur-[120px]"
        style={{
          background: "radial-gradient(circle, #2563eb 0%, transparent 70%)",
          animation: "meshFloat 15s ease-in-out infinite",
        }}
      />
      <div
        className="absolute top-1/3 right-1/4 w-[500px] h-[500px] rounded-full opacity-20 blur-[100px]"
        style={{
          background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)",
          animation: "meshFloat2 18s ease-in-out infinite",
        }}
      />
      <div
        className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] rounded-full opacity-15 blur-[80px]"
        style={{
          background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)",
          animation: "meshFloat3 12s ease-in-out infinite",
        }}
      />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
    </div>
  );
}

function DashboardMockup() {
  return (
    <div
      className="relative mx-auto max-w-4xl"
      style={{
        animation: "mockupReveal 1s var(--ease-smooth) 0.5s both",
        perspective: "1200px",
      }}
    >
      {/* Glow behind mockup */}
      <div className="absolute -inset-4 bg-brand-500/10 rounded-3xl blur-3xl" />

      {/* Mockup frame */}
      <div className="relative rounded-xl border border-surface-200/30 bg-surface-50/5 backdrop-blur-sm shadow-2xl overflow-hidden">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-200/20 bg-surface-100/10">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-danger-500/60" />
            <div className="w-3 h-3 rounded-full bg-warning-500/60" />
            <div className="w-3 h-3 rounded-full bg-success-500/60" />
          </div>
          <div className="flex-1 mx-4">
            <div className="mx-auto max-w-sm h-6 rounded-md bg-surface-200/20 flex items-center justify-center">
              <span className="text-xs text-surface-500 font-mono">app.burnless.com/dashboard</span>
            </div>
          </div>
        </div>

        {/* Dashboard content */}
        <div className="p-6 grid grid-cols-12 gap-4">
          {/* Sidebar hint */}
          <div className="col-span-2 hidden md:block space-y-3">
            <div className="h-8 rounded-md bg-brand-500/20" />
            <div className="h-6 rounded-md bg-surface-200/15" />
            <div className="h-6 rounded-md bg-surface-200/15" />
            <div className="h-6 rounded-md bg-surface-200/15" />
            <div className="h-6 rounded-md bg-surface-200/10" />
            <div className="h-6 rounded-md bg-surface-200/10" />
          </div>

          {/* Main area */}
          <div className="col-span-12 md:col-span-10 space-y-4">
            {/* Top metrics row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Runway", value: "18.2 mo", color: "text-success-500" },
                { label: "Monthly Burn", value: "$42.5K", color: "text-danger-500" },
                { label: "MRR", value: "$28.3K", color: "text-brand-400" },
                { label: "Cash", value: "$774K", color: "text-surface-900" },
              ].map((m) => (
                <div key={m.label} className="rounded-lg bg-surface-200/10 border border-surface-200/20 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">{m.label}</div>
                  <div className={`text-lg font-bold font-mono ${m.color}`}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Chart area */}
            <div className="rounded-lg bg-surface-200/10 border border-surface-200/20 p-4 h-36">
              <div className="text-xs text-surface-500 mb-3">Cash Flow — Last 6 Months</div>
              <div className="flex items-end gap-2 h-20">
                {[65, 58, 72, 45, 55, 68, 80, 62, 75, 85, 70, 90].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm"
                    style={{
                      height: `${h}%`,
                      background: h > 70
                        ? "linear-gradient(to top, #2563eb, #60a5fa)"
                        : "linear-gradient(to top, #243050, #344263)",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Bottom row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-surface-200/10 border border-surface-200/20 p-3 h-20">
                <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-2">AI Insight</div>
                <div className="text-xs text-surface-400 leading-relaxed">
                  Burn rate decreased 12% this month. At current pace, runway extends to Sep 2027.
                </div>
              </div>
              <div className="rounded-lg bg-surface-200/10 border border-surface-200/20 p-3 h-20">
                <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-2">Top Expenses</div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-surface-400">Payroll</span>
                    <span className="text-surface-900 font-mono">$31.2K</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-surface-400">Infrastructure</span>
                    <span className="text-surface-900 font-mono">$4.8K</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FloatingMetric({
  label,
  value,
  position,
  delay,
}: {
  label: string;
  value: string;
  position: string;
  delay: string;
}) {
  return (
    <div
      className={`absolute ${position} hidden lg:block`}
      style={{ animation: `metricFloat 0.6s var(--ease-smooth) ${delay} both` }}
    >
      <div className="rounded-xl bg-surface-0/10 backdrop-blur-xl border border-surface-200/20 px-4 py-3 shadow-xl hover-lift">
        <div className="text-[10px] uppercase tracking-wider text-surface-500">{label}</div>
        <div className="text-lg font-bold font-mono text-surface-900 tabular-nums">{value}</div>
      </div>
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center pt-16 overflow-hidden">
      <MeshGradient />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
        {/* Badge */}
        <div className="text-center mb-6" style={{ animation: "heroBadgeReveal 0.6s var(--ease-smooth) 0.1s both" }}>
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 border border-brand-500/20 px-4 py-1.5 text-sm font-medium text-brand-400">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
            AI-powered financial planning
          </span>
        </div>

        {/* Headline */}
        <div className="text-center max-w-4xl mx-auto">
          <h1
            className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-surface-900 leading-[1.1]"
            style={{ animation: "heroTextReveal 0.8s var(--ease-smooth) 0.2s both" }}
          >
            Know your runway.
            <br />
            <span className="bg-gradient-to-r from-brand-400 via-violet-400 to-brand-600 bg-clip-text text-transparent gradient-shimmer-text">
              Plan your future.
            </span>
          </h1>

          <p
            className="mt-6 text-lg sm:text-xl text-surface-500 max-w-2xl mx-auto leading-relaxed"
            style={{ animation: "heroTextReveal 0.8s var(--ease-smooth) 0.35s both" }}
          >
            Your AI financial companion that understands burn rate, forecasts runway,
            and helps you make confident decisions — not spreadsheet guesses.
          </p>

          {/* CTA */}
          <div
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            style={{ animation: "heroTextReveal 0.8s var(--ease-smooth) 0.5s both" }}
          >
            <Link
              href="/login"
              onClick={() => trackEvent("landing_hero_cta_clicked")}
              className="rounded-xl bg-brand-500 px-8 py-3.5 text-base font-semibold text-white hover:bg-brand-400 transition-all shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-0.5 press-effect cta-glow"
            >
              See your runway →
            </Link>
            <Link
              href="#features"
              className="rounded-xl border border-surface-200/30 bg-surface-0/5 backdrop-blur-sm px-8 py-3.5 text-base font-medium text-surface-600 hover:bg-surface-50/10 hover:border-surface-200/50 transition-all hover:-translate-y-0.5"
            >
              See how it works
            </Link>
          </div>

          {/* Trust badges */}
          <div
            className="mt-8 flex items-center justify-center gap-6 text-xs text-surface-500"
            style={{ animation: "heroTextReveal 0.8s var(--ease-smooth) 0.65s both" }}
          >
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              256-bit encrypted
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              SOC 2 ready
            </span>
            <span className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              GDPR compliant
            </span>
          </div>
        </div>

        {/* Dashboard mockup */}
        <div className="mt-16 sm:mt-20 relative">
          <FloatingMetric label="Runway" value="18.2 mo" position="-left-4 top-1/4" delay="1.1s" />
          <FloatingMetric label="MRR Growth" value="+23%" position="-right-4 top-1/3" delay="1.3s" />
          <FloatingMetric label="Burn Rate" value="$42.5K" position="-left-8 bottom-1/4" delay="1.5s" />
          <DashboardMockup />
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2"
        style={{ animation: "heroTextReveal 0.8s var(--ease-smooth) 1.8s both" }}
      >
        <span className="text-[10px] uppercase tracking-widest text-surface-400">Scroll to explore</span>
        <div className="w-5 h-8 rounded-full border-2 border-surface-300/40 flex justify-center pt-1.5">
          <div className="w-1 h-2 rounded-full bg-surface-400/60 animate-bounce" />
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-surface-0 to-transparent" />
    </section>
  );
}
