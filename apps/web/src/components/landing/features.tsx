"use client";

import {
  Bot,
  Gauge,
  Sparkles,
  Zap,
  AlertTriangle,
  GitBranch,
  TrendingUp,
  Users,
  ArrowRight,
} from "lucide-react";
import { useInView } from "./use-in-view";
import { AIChatMockup, RunwayGauge } from "./feature-visuals";
import { bottomFeatures, CardVisual } from "./feature-cards";

/* ─────────────────────────────────────────────
   Main Feature Section
   ───────────────────────────────────────────── */

export function FeatureBento() {
  const { ref: headerRef, inView: headerInView } = useInView(0.1);
  const { ref: aiRef, inView: aiInView } = useInView(0.15);
  const { ref: runwayRef, inView: runwayInView } = useInView(0.15);
  const { ref: bottomRef, inView: bottomInView } = useInView(0.1);

  return (
    <section id="features" className="py-24 sm:py-32 relative overflow-hidden">
      {/* Subtle ambient gradient */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-[0.04] blur-[120px] pointer-events-none"
        style={{
          background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── Section Header ──────────────────────────── */}
        <div
          ref={headerRef}
          className={`text-center mb-20 transition-all duration-700 ${
            headerInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div
            className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 border border-brand-500/20 px-4 py-1.5 text-sm font-medium text-brand-400 mb-6"
            style={{ transitionDelay: headerInView ? "0.1s" : "0s" }}
          >
            <Sparkles className="w-4 h-4" />
            Features
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-surface-900 tracking-tight leading-tight">
            Built for founders who need
            <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-brand-400 via-violet-400 to-brand-500 bg-clip-text text-transparent">
              {" "}answers, not spreadsheets
            </span>
          </h2>
          <p className="mt-5 text-lg text-surface-500 max-w-2xl mx-auto leading-relaxed">
            Every metric, insight, and projection your startup needs — powered by AI that understands your business.
          </p>
        </div>

        {/* ── AI Feature Showcase ─────────────────────── */}
        <div
          ref={aiRef}
          className={`mb-6 transition-all duration-700 ${
            aiInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
          }`}
        >
          <div className="relative group rounded-2xl border border-surface-200/20 overflow-hidden">
            {/* Background gradient */}
            <div
              className="absolute inset-0 opacity-60"
              style={{
                background:
                  "linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(124,58,237,0.06) 50%, rgba(59,130,246,0.03) 100%)",
              }}
            />
            {/* Hover glow */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none">
              <div
                className="absolute -inset-1 blur-3xl"
                style={{
                  background: "radial-gradient(600px circle at 50% 50%, rgba(59,130,246,0.06), transparent 70%)",
                }}
              />
            </div>

            <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-0">
              {/* Left: Chat Mockup */}
              <div className="p-6 sm:p-8 lg:p-10 lg:border-r border-surface-200/10">
                <AIChatMockup visible={aiInView} />
              </div>

              {/* Right: Copy */}
              <div className="p-6 sm:p-8 lg:p-10 flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-accent-400" />
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-r from-accent-500/20 to-transparent" />
                </div>

                <h3 className="text-2xl sm:text-3xl font-bold text-surface-900 tracking-tight mb-3">
                  Your AI CFO
                </h3>
                <p className="text-surface-500 leading-relaxed mb-6">
                  Ask anything about your finances. Get instant answers, scenario modeling, and data narratives — no spreadsheet skills required.
                </p>

                <div className="space-y-3">
                  {[
                    { icon: Zap, text: "Natural language queries" },
                    { icon: AlertTriangle, text: "Proactive alerts" },
                    { icon: GitBranch, text: "One-click scenarios" },
                  ].map((item) => (
                    <div key={item.text} className="flex items-center gap-3 group/item">
                      <div className="w-7 h-7 rounded-lg bg-accent-500/8 border border-accent-500/15 flex items-center justify-center transition-all duration-300 group-hover/item:bg-accent-500/15 group-hover/item:border-accent-500/25">
                        <item.icon className="w-3.5 h-3.5 text-accent-400" />
                      </div>
                      <span className="text-sm font-medium text-surface-700 transition-colors duration-300 group-hover/item:text-surface-900">
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Runway Feature Showcase ─────────────────── */}
        <div
          ref={runwayRef}
          className={`mb-6 transition-all duration-700 ${
            runwayInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
          }`}
          style={{ transitionDelay: runwayInView ? "0.15s" : "0s" }}
        >
          <div className="relative group rounded-2xl border border-surface-200/20 overflow-hidden">
            {/* Background gradient */}
            <div
              className="absolute inset-0 opacity-60"
              style={{
                background:
                  "linear-gradient(135deg, rgba(239,68,68,0.05) 0%, rgba(245,158,11,0.04) 40%, rgba(16,185,129,0.05) 100%)",
              }}
            />
            {/* Hover glow */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none">
              <div
                className="absolute -inset-1 blur-3xl"
                style={{
                  background: "radial-gradient(600px circle at 50% 50%, rgba(16,185,129,0.06), transparent 70%)",
                }}
              />
            </div>

            <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-0">
              {/* Left: Copy */}
              <div className="p-6 sm:p-8 lg:p-10 flex flex-col justify-center order-2 lg:order-1">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-danger-500/10 border border-danger-500/20 flex items-center justify-center">
                    <Gauge className="w-5 h-5 text-danger-400" />
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-r from-danger-500/20 via-warning-500/15 to-transparent" />
                </div>

                <h3 className="text-2xl sm:text-3xl font-bold text-surface-900 tracking-tight mb-3">
                  Never be surprised by zero
                </h3>
                <p className="text-surface-500 leading-relaxed mb-6">
                  Real-time runway tracking with intelligent alerts. Know exactly when you need to fundraise, cut costs, or accelerate revenue.
                </p>

                <div className="space-y-3">
                  {[
                    { icon: TrendingUp, text: "Live burn rate tracking", color: "text-danger-400", bg: "bg-danger-500/8 border-danger-500/15" },
                    { icon: AlertTriangle, text: "Smart threshold alerts", color: "text-warning-400", bg: "bg-warning-500/8 border-warning-500/15" },
                    { icon: Users, text: "Peer benchmarking", color: "text-success-400", bg: "bg-success-500/8 border-success-500/15" },
                  ].map((item) => (
                    <div key={item.text} className="flex items-center gap-3 group/item">
                      <div className={`w-7 h-7 rounded-lg ${item.bg} border flex items-center justify-center transition-all duration-300`}>
                        <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                      </div>
                      <span className="text-sm font-medium text-surface-700 transition-colors duration-300 group-hover/item:text-surface-900">
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Gauge visual */}
              <div className="p-6 sm:p-8 lg:p-10 order-1 lg:order-2 lg:border-l border-surface-200/10">
                <RunwayGauge visible={runwayInView} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom Row — 4 Smaller Cards ────────────── */}
        <div
          ref={bottomRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {bottomFeatures.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className={`group relative rounded-2xl border border-surface-200/20 overflow-hidden transition-all duration-500 hover:border-surface-200/40 hover:-translate-y-1 hover:shadow-xl ${
                  bottomInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{
                  transitionDelay: bottomInView ? `${i * 0.1 + 0.1}s` : "0s",
                }}
              >
                {/* Gradient bg */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                />

                <div className="relative">
                  {/* Visual area */}
                  <div className="h-28 border-b border-surface-200/10 bg-surface-200/[0.03] relative overflow-hidden">
                    <CardVisual type={feature.visual} />
                    {/* Fade overlay */}
                    <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-surface-0/80 to-transparent" />
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <div className={`w-8 h-8 rounded-lg ${feature.iconBg} border flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
                        <Icon className={`w-4 h-4 ${feature.iconColor}`} />
                      </div>
                      <h3 className="text-sm font-semibold text-surface-900">
                        {feature.title}
                      </h3>
                    </div>
                    <p className="text-xs text-surface-500 leading-relaxed">
                      {feature.description}
                    </p>

                    {/* Hover arrow */}
                    <div className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-400 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-0 group-hover:translate-x-1">
                      Learn more <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </div>

                {/* Bottom glow line */}
                <div className="absolute bottom-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-brand-400/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
