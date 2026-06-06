"use client";

import { useEffect, useState } from "react";
import { Bot, User, TrendingDown, DollarSign, Clock } from "lucide-react";
import { useInView } from "./use-in-view";

const userMessage = "What if we hire 3 engineers next quarter?";

const aiResponse =
  "Based on your current financials, hiring 3 engineers at market rate (~$150K avg) would:";

const impactCards = [
  {
    icon: DollarSign,
    label: "Monthly burn increase",
    value: "+$37.5K",
    detail: "From $42.5K → $80K/mo",
    tone: "text-warning-600",
  },
  {
    icon: Clock,
    label: "Runway impact",
    value: "18.2 → 9.7 mo",
    detail: "Drops below 12-month threshold",
    tone: "text-danger-600",
  },
  {
    icon: TrendingDown,
    label: "Recommendation",
    value: "Hire 2, defer 1",
    detail: "Keeps runway above 12 months",
    tone: "text-success-600",
  },
];

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-brand-500"
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
  // 0: idle, 1: user message, 2: typing, 3: AI response, 4: impact cards

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
    <section id="companion" ref={ref} className="border-y border-surface-200 bg-surface-50 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-surface-900 sm:text-4xl">
            It doesn’t wait to be asked.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-surface-600">
            It knows your numbers cold — ask a question, model a decision, or have it make
            the change. No spreadsheet required.
          </p>
        </div>

        {/* Chat */}
        <div className="mx-auto mt-12 max-w-2xl overflow-hidden rounded-2xl border border-surface-200 bg-surface-0 shadow-lg">
          {/* Chat header — product UI, not browser chrome */}
          <div className="flex items-center gap-3 border-b border-surface-200 px-5 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50">
              <Bot className="h-4 w-4 text-brand-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-surface-900">burnless AI</div>
              <div className="flex items-center gap-1 text-xs text-success-600">
                <span className="h-1.5 w-1.5 rounded-full bg-success-500" aria-hidden="true" />
                Online
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="min-h-[300px] space-y-4 p-5">
            {stage >= 1 && (
              <div className="flex justify-end" style={{ animation: "fadeSlideIn 0.4s var(--ease-smooth) both" }}>
                <div className="flex max-w-[80%] items-start gap-2.5">
                  <div className="rounded-2xl rounded-tr-md bg-brand-600 px-4 py-2.5 text-sm text-white">
                    {userMessage}
                  </div>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-100">
                    <User className="h-3.5 w-3.5 text-surface-500" />
                  </div>
                </div>
              </div>
            )}

            {stage === 2 && (
              <div className="flex items-start gap-2.5" style={{ animation: "fadeSlideIn 0.3s var(--ease-smooth) both" }}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50">
                  <Bot className="h-3.5 w-3.5 text-brand-600" />
                </div>
                <div className="rounded-2xl rounded-tl-md border border-surface-200 bg-surface-50">
                  <TypingIndicator />
                </div>
              </div>
            )}

            {stage >= 3 && (
              <div className="flex items-start gap-2.5" style={{ animation: "fadeSlideIn 0.4s var(--ease-smooth) both" }}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50">
                  <Bot className="h-3.5 w-3.5 text-brand-600" />
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-surface-200 bg-surface-50 px-4 py-2.5">
                  <p className="text-sm text-surface-900">{aiResponse}</p>
                </div>
              </div>
            )}

            {stage >= 4 && (
              <div className="ml-9 grid gap-2">
                {impactCards.map((card, i) => (
                  <div
                    key={card.label}
                    className="flex items-center gap-3 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3"
                    style={{ animation: `metricFloat 0.5s var(--ease-smooth) ${i * 0.15}s both` }}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-100">
                      <card.icon className={`h-4 w-4 ${card.tone}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-surface-500">{card.label}</div>
                      <div className={`font-mono text-sm font-bold ${card.tone}`}>{card.value}</div>
                    </div>
                    <div className="hidden text-xs text-surface-500 sm:block">{card.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-surface-200 px-5 py-3">
            <div className="flex items-center gap-2 rounded-xl border border-surface-200 bg-surface-50 px-4 py-2.5">
              <span className="flex-1 text-sm text-surface-400">Ask about your finances…</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50">
                <svg className="h-3.5 w-3.5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
