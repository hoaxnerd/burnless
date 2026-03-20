"use client";

import {
  Bot,
  TrendingDown,
  GitBranch,
  BarChart3,
  Plug,
  FileText,
} from "lucide-react";
import { useInView } from "./use-in-view";

const features = [
  {
    icon: Bot,
    title: "AI Financial Companion",
    description: "Ask your AI CFO anything about your finances. Get actionable insights in plain English, not spreadsheet formulas.",
    span: "col-span-1 sm:col-span-2",
    accent: "from-brand-500/20 to-violet-500/10",
  },
  {
    icon: TrendingDown,
    title: "Runway & Burn Analysis",
    description: "Know exactly when you run out of money. Track burn rate trends and get alerts before it's too late.",
    span: "col-span-1",
    accent: "from-danger-500/15 to-warning-500/10",
  },
  {
    icon: GitBranch,
    title: "Scenario Planning",
    description: "Model any decision before you make it. Hire 3 engineers? Raise at $10M? See the impact instantly.",
    span: "col-span-1",
    accent: "from-violet-500/15 to-brand-500/10",
  },
  {
    icon: BarChart3,
    title: "Revenue Intelligence",
    description: "Track MRR, ARR, churn, and growth metrics that investors actually want to see. Benchmarked against peers.",
    span: "col-span-1 sm:col-span-2",
    accent: "from-success-500/15 to-brand-500/10",
  },
  {
    icon: Plug,
    title: "Smart Integrations",
    description: "Connect your bank, sync your books, start in minutes. QuickBooks, Xero, Plaid, Mercury — all supported.",
    span: "col-span-1",
    accent: "from-brand-500/15 to-success-500/10",
  },
  {
    icon: FileText,
    title: "Investor Reports",
    description: "One-click board decks that look like they came from a CFO. Auto-generated narratives and benchmarks.",
    span: "col-span-1 sm:col-span-2",
    accent: "from-warning-500/15 to-brand-500/10",
  },
];

export function FeatureBento() {
  const { ref, inView } = useInView(0.1);

  return (
    <section id="features" ref={ref} className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div
          className={`text-center mb-16 transition-all duration-700 ${
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight">
            Everything your startup needs
          </h2>
          <p className="mt-4 text-lg text-surface-500 max-w-2xl mx-auto">
            Financial clarity in minutes, not months. Built for founders who move fast.
          </p>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className={`${feature.span} group relative rounded-2xl border border-surface-200/30 bg-surface-50/5 backdrop-blur-sm p-6 sm:p-8 transition-all duration-300 hover:border-surface-200/50 hover:scale-[1.02] hover:shadow-xl`}
                style={{
                  transition: "all 0.3s var(--ease-smooth)",
                  opacity: inView ? 1 : 0,
                  transform: inView ? "translateY(0)" : "translateY(30px)",
                  transitionDelay: `${i * 0.08}s`,
                }}
              >
                {/* Gradient background on hover */}
                <div
                  className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
                />

                <div className="relative">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-brand-400" />
                  </div>

                  {/* Content */}
                  <h3 className="text-lg font-semibold text-surface-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-surface-500 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
