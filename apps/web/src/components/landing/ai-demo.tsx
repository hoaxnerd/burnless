"use client";

import { useEffect, useState } from "react";
import { Bot, User, TrendingDown, DollarSign, Clock } from "lucide-react";
import { useInView } from "./use-in-view";

const userMessage = "What if we hire 3 engineers next quarter?";

const aiResponse = "Based on your current financials, hiring 3 engineers at market rate (~$150K avg) would:";

const impactCards = [
  {
    icon: DollarSign,
    label: "Monthly burn increase",
    value: "+$37.5K",
    detail: "From $42.5K → $80K/mo",
    color: "text-warning-500",
  },
  {
    icon: Clock,
    label: "Runway impact",
    value: "18.2 → 9.7 mo",
    detail: "Drops below 12-month threshold",
    color: "text-danger-500",
  },
  {
    icon: TrendingDown,
    label: "Recommendation",
    value: "Hire 2, defer 1",
    detail: "Keeps runway above 12 months",
    color: "text-success-500",
  },
];

function TypingIndicator() {
  return (
    <div className="flex gap-1 items-center px-3 py-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-brand-400"
          style={{
            animation: "typingCursor 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

export function AIDemoSection() {
  const { ref, inView } = useInView(0.2);
  const [stage, setStage] = useState(0);
  // 0: idle, 1: user message appears, 2: typing, 3: AI response, 4: cards appear

  useEffect(() => {
    if (!inView) return;

    const timers = [
      setTimeout(() => setStage(1), 300),
      setTimeout(() => setStage(2), 1200),
      setTimeout(() => setStage(3), 2500),
      setTimeout(() => setStage(4), 3200),
    ];

    return () => timers.forEach(clearTimeout);
  }, [inView]);

  return (
    <section id="ai-demo" ref={ref} className="py-24 sm:py-32 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-surface-0 via-surface-50 to-surface-0" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div
          className={`text-center mb-16 transition-all duration-700 ${
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 border border-brand-500/20 px-4 py-1.5 text-sm font-medium text-brand-400 mb-6">
            <Bot className="w-4 h-4" />
            Companion
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight">
            Ask anything. Get clarity.
          </h2>
          <p className="mt-4 text-lg text-surface-500 max-w-2xl mx-auto">
            Your financial companion analyzes your data and answers questions
            in plain English — like having a CFO on speed dial.
          </p>
        </div>

        {/* Chat mockup */}
        <div className="max-w-2xl mx-auto relative">
          {/* Ambient glow behind chat */}
          <div
            className="absolute -inset-8 rounded-3xl opacity-0 blur-3xl transition-opacity duration-1000 pointer-events-none"
            style={{
              background: "radial-gradient(circle, rgba(37, 99, 235, 0.12) 0%, transparent 70%)",
              opacity: stage >= 3 ? 0.6 : 0,
            }}
          />

          <div className="relative rounded-2xl border border-surface-200/30 bg-surface-50/5 backdrop-blur-sm overflow-hidden shadow-2xl">
            {/* Chat header */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-surface-200/20 bg-surface-100/10">
              <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-brand-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-surface-900">burnless AI</div>
                <div className="text-xs text-success-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-success-500" aria-hidden="true" />
                  Online
                </div>
              </div>
            </div>

            {/* Chat messages */}
            <div className="p-5 space-y-4 min-h-[300px]">
              {/* User message */}
              {stage >= 1 && (
                <div className="flex justify-end" style={{ animation: "fadeSlideIn 0.4s var(--ease-smooth) both" }}>
                  <div className="flex items-start gap-2.5 max-w-[80%]">
                    <div className="rounded-2xl rounded-tr-md bg-brand-500 px-4 py-2.5 text-sm text-white">
                      {userMessage}
                    </div>
                    <div className="w-7 h-7 rounded-full bg-surface-200/20 flex items-center justify-center shrink-0">
                      <User className="w-3.5 h-3.5 text-surface-500" />
                    </div>
                  </div>
                </div>
              )}

              {/* Typing indicator */}
              {stage === 2 && (
                <div className="flex items-start gap-2.5" style={{ animation: "fadeSlideIn 0.3s var(--ease-smooth) both" }}>
                  <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
                    <Bot className="w-3.5 h-3.5 text-brand-400" />
                  </div>
                  <div className="rounded-2xl rounded-tl-md bg-surface-200/10 border border-surface-200/20">
                    <TypingIndicator />
                  </div>
                </div>
              )}

              {/* AI response */}
              {stage >= 3 && (
                <div className="flex items-start gap-2.5" style={{ animation: "fadeSlideIn 0.4s var(--ease-smooth) both" }}>
                  <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
                    <Bot className="w-3.5 h-3.5 text-brand-400" />
                  </div>
                  <div className="rounded-2xl rounded-tl-md bg-surface-200/10 border border-surface-200/20 px-4 py-2.5 max-w-[85%]">
                    <p className="text-sm text-surface-900">{aiResponse}</p>
                  </div>
                </div>
              )}

              {/* Impact cards */}
              {stage >= 4 && (
                <div className="ml-9 grid gap-2">
                  {impactCards.map((card, i) => {
                    const Icon = card.icon;
                    return (
                      <div
                        key={card.label}
                        className="flex items-center gap-3 rounded-xl bg-surface-200/10 border border-surface-200/20 px-4 py-3"
                        style={{
                          animation: `metricFloat 0.5s var(--ease-smooth) ${i * 0.15}s both`,
                        }}
                      >
                        <div className="w-8 h-8 rounded-lg bg-surface-200/15 flex items-center justify-center shrink-0 transition-transform duration-300 hover:scale-110">
                          <Icon className={`w-4 h-4 ${card.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-surface-500">{card.label}</div>
                          <div className={`text-sm font-bold font-mono ${card.color}`}>{card.value}</div>
                        </div>
                        <div className="text-xs text-surface-500 hidden sm:block">{card.detail}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="px-5 py-3 border-t border-surface-200/20 bg-surface-100/5">
              <div className="flex items-center gap-2 rounded-xl bg-surface-200/10 border border-surface-200/20 px-4 py-2.5">
                <span className="text-sm text-surface-400 flex-1">Ask about your finances...</span>
                <div className="w-7 h-7 rounded-lg bg-brand-500/20 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
