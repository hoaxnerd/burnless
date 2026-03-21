"use client";

import Link from "next/link";
import {
  ArrowRight,
  Play,
  Rocket,
  Clock,
  CreditCard,
  Lock,
  Shield,
  CheckCircle2,
} from "lucide-react";
import { useInView } from "./use-in-view";
import { trackEvent } from "@/lib/analytics";

/* ── Metric cards above headline ─────────────────────────────────────────── */

const metrics = [
  {
    icon: Rocket,
    value: "500+",
    label: "startups",
    color: "text-brand-400",
    bg: "bg-brand-500/10",
    border: "border-brand-500/20",
  },
  {
    icon: Clock,
    value: "30 sec",
    label: "setup",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
  },
  {
    icon: CreditCard,
    value: "$0",
    label: "to start",
    color: "text-success-400",
    bg: "bg-success-500/10",
    border: "border-success-500/20",
  },
];

/* ── Trust badges ────────────────────────────────────────────────────────── */

const trustBadges = [
  { icon: Lock, label: "256-bit encryption" },
  { icon: Shield, label: "SOC 2 ready" },
  { icon: CheckCircle2, label: "GDPR compliant" },
];

/* ── Subtle mesh gradient (lighter than hero) ────────────────────────────── */

function CTAMeshGradient() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute top-1/3 left-1/3 w-[500px] h-[500px] rounded-full opacity-15 blur-[120px]"
        style={{
          background: "radial-gradient(circle, #2563eb 0%, transparent 70%)",
          animation: "meshFloat 18s ease-in-out infinite",
        }}
      />
      <div
        className="absolute top-1/2 right-1/4 w-[400px] h-[400px] rounded-full opacity-10 blur-[100px]"
        style={{
          background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)",
          animation: "meshFloat2 22s ease-in-out infinite",
        }}
      />
      <div
        className="absolute bottom-1/3 left-1/2 w-[350px] h-[350px] rounded-full opacity-10 blur-[90px]"
        style={{
          background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)",
          animation: "meshFloat3 15s ease-in-out infinite",
        }}
      />
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export function CTASection() {
  const { ref, inView } = useInView();

  return (
    <section
      ref={ref}
      className="py-24 sm:py-32 relative overflow-hidden"
    >
      <CTAMeshGradient />

      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Metric cards */}
        <div
          className={`flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 mb-12 transition-all duration-700 ${
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {metrics.map((m, i) => (
            <div
              key={m.label}
              className={`flex items-center gap-3 rounded-2xl ${m.bg} border ${m.border} px-5 py-3.5 transition-all duration-500 hover:-translate-y-0.5 hover:shadow-lg`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div
                className={`w-9 h-9 rounded-xl ${m.bg} flex items-center justify-center`}
              >
                <m.icon className={`w-4.5 h-4.5 ${m.color}`} />
              </div>
              <div>
                <div className={`text-lg font-bold font-mono ${m.color}`}>
                  {m.value}
                </div>
                <div className="text-xs text-surface-500">{m.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Headline */}
        <div
          className={`text-center transition-all duration-700 ${
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
          style={{ transitionDelay: "200ms" }}
        >
          <h2 className="text-3xl sm:text-5xl font-bold text-surface-900 tracking-tight leading-tight">
            Ready to stop
            <br />
            <span className="bg-gradient-to-r from-brand-400 via-violet-400 to-brand-600 bg-clip-text text-transparent gradient-shimmer-text">
              guessing your runway?
            </span>
          </h2>

          <p className="mt-6 text-lg text-surface-500 max-w-xl mx-auto leading-relaxed">
            Join founders who replaced spreadsheet anxiety with financial
            clarity. Free to start, no credit card required.
          </p>
        </div>

        {/* Dual CTA */}
        <div
          className={`mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 ${
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
          style={{ transitionDelay: "350ms" }}
        >
          <Link
            href="/login"
            onClick={() => trackEvent("landing_cta_signup_clicked")}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-8 py-4 text-base font-semibold text-white hover:bg-brand-400 transition-all shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-0.5 group press-effect cta-glow"
          >
            Start free
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>

          <button
            type="button"
            onClick={() => trackEvent("landing_cta_demo_clicked")}
            className="inline-flex items-center gap-2 rounded-xl border border-surface-200/30 bg-surface-0/5 backdrop-blur-sm px-8 py-4 text-base font-semibold text-surface-900 hover:bg-surface-200/15 hover:border-surface-200/50 transition-all hover:-translate-y-0.5 group"
          >
            <Play className="w-4 h-4 text-brand-400 transition-transform group-hover:scale-110" />
            Watch 60-second demo
          </button>
        </div>

        {/* Trust badges as pills */}
        <div
          className={`mt-10 flex flex-wrap items-center justify-center gap-3 transition-all duration-700 ${
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
          style={{ transitionDelay: "500ms" }}
        >
          {trustBadges.map((badge) => (
            <span
              key={badge.label}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-200/10 border border-surface-200/20 px-3.5 py-1.5 text-xs font-medium text-surface-500 transition-colors hover:bg-surface-200/20 hover:text-surface-600"
            >
              <badge.icon className="w-3.5 h-3.5" />
              {badge.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
