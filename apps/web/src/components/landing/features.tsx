"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  Gauge,
  GitBranch,
  BarChart3,
  FileText,
  Plug,
  Send,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Users,
  Zap,
  ArrowRight,
} from "lucide-react";
import { useInView } from "./use-in-view";

/* ─────────────────────────────────────────────
   AI Chat Mockup — shows a mini conversation
   ───────────────────────────────────────────── */

function AIChatMockup({ visible }: { visible: boolean }) {
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
        <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center">
          <Bot className="w-3 h-3 text-brand-400" />
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
            <div className="w-5 h-5 rounded-full bg-brand-500/15 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-2.5 h-2.5 text-brand-400" />
            </div>
            <div className="rounded-xl rounded-tl-sm bg-surface-200/10 border border-surface-200/15 px-3 py-2 flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1 h-1 rounded-full bg-brand-400"
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
            <div className="w-5 h-5 rounded-full bg-brand-500/15 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-2.5 h-2.5 text-brand-400" />
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

function RunwayGauge({ visible }: { visible: boolean }) {
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

/* ─────────────────────────────────────────────
   Bottom Feature Cards — smaller showcase cards
   ───────────────────────────────────────────── */

const bottomFeatures = [
  {
    icon: GitBranch,
    title: "Scenario Planning",
    description: "Model any 'what if' before you commit",
    gradient: "from-violet-500/15 to-brand-500/5",
    iconColor: "text-violet-400",
    iconBg: "bg-violet-500/10 border-violet-500/20",
    visual: "branches",
  },
  {
    icon: BarChart3,
    title: "Revenue Intelligence",
    description: "MRR, ARR, churn — benchmarked",
    gradient: "from-success-500/15 to-brand-500/5",
    iconColor: "text-success-400",
    iconBg: "bg-success-500/10 border-success-500/20",
    visual: "chart",
  },
  {
    icon: FileText,
    title: "Investor Reports",
    description: "Board decks in one click",
    gradient: "from-warning-500/15 to-brand-500/5",
    iconColor: "text-warning-400",
    iconBg: "bg-warning-500/10 border-warning-500/20",
    visual: "document",
  },
  {
    icon: Plug,
    title: "Smart Integrations",
    description: "Connect in minutes",
    gradient: "from-brand-500/15 to-success-500/5",
    iconColor: "text-brand-400",
    iconBg: "bg-brand-500/10 border-brand-500/20",
    visual: "logos",
  },
];

function BranchVisual() {
  return (
    <div className="flex items-center justify-center h-full">
      <svg width="80" height="64" viewBox="0 0 80 64" fill="none" className="text-violet-400/60">
        {/* Main trunk */}
        <path d="M40 4 L40 60" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        {/* Branch left */}
        <path d="M40 20 Q30 20 22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        {/* Branch right */}
        <path d="M40 35 Q50 35 58 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        {/* Branch left 2 */}
        <path d="M40 48 Q30 48 20 42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        {/* Nodes */}
        <circle cx="40" cy="20" r="3" fill="currentColor" />
        <circle cx="40" cy="35" r="3" fill="currentColor" />
        <circle cx="40" cy="48" r="3" fill="currentColor" />
        <circle cx="22" cy="12" r="3" className="text-violet-300/80" fill="currentColor" />
        <circle cx="58" cy="28" r="3" className="text-violet-300/80" fill="currentColor" />
        <circle cx="20" cy="42" r="3" className="text-violet-300/80" fill="currentColor" />
      </svg>
    </div>
  );
}

function MiniChart() {
  const bars = [35, 42, 38, 55, 48, 65, 58, 72, 68, 80, 75, 88];
  return (
    <div className="flex items-end gap-[3px] h-full px-2 pb-1">
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm transition-all duration-500"
          style={{
            height: `${h}%`,
            background:
              i >= 8
                ? "linear-gradient(to top, #10b981, #34d399)"
                : "linear-gradient(to top, #1e3a5f, #2563eb40)",
            transitionDelay: `${i * 40}ms`,
          }}
        />
      ))}
    </div>
  );
}

function DocumentPreview() {
  return (
    <div className="flex flex-col gap-1.5 p-2 h-full justify-center">
      <div className="h-2 w-3/4 rounded-full bg-warning-400/30" />
      <div className="h-1.5 w-full rounded-full bg-surface-200/15" />
      <div className="h-1.5 w-full rounded-full bg-surface-200/15" />
      <div className="h-1.5 w-5/6 rounded-full bg-surface-200/15" />
      <div className="mt-1.5 h-8 w-full rounded bg-surface-200/8 border border-surface-200/10" />
      <div className="h-1.5 w-full rounded-full bg-surface-200/15" />
      <div className="h-1.5 w-2/3 rounded-full bg-surface-200/15" />
    </div>
  );
}

function LogoGrid() {
  const logos = ["QB", "Xe", "Pl", "Me", "St", "Gm"];
  return (
    <div className="grid grid-cols-3 gap-1.5 p-2 h-full place-content-center">
      {logos.map((l) => (
        <div
          key={l}
          className="w-8 h-8 rounded-lg bg-surface-200/10 border border-surface-200/15 flex items-center justify-center"
        >
          <span className="text-[9px] font-bold text-surface-500 font-mono">{l}</span>
        </div>
      ))}
    </div>
  );
}

function CardVisual({ type }: { type: string }) {
  switch (type) {
    case "branches":
      return <BranchVisual />;
    case "chart":
      return <MiniChart />;
    case "document":
      return <DocumentPreview />;
    case "logos":
      return <LogoGrid />;
    default:
      return null;
  }
}

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
                  <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-brand-400" />
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-r from-brand-500/20 to-transparent" />
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
                      <div className="w-7 h-7 rounded-lg bg-brand-500/8 border border-brand-500/15 flex items-center justify-center transition-all duration-300 group-hover/item:bg-brand-500/15 group-hover/item:border-brand-500/25">
                        <item.icon className="w-3.5 h-3.5 text-brand-400" />
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
