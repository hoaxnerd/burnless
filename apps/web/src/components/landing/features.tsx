"use client";

import {
  GitBranch,
  BarChart3,
  FileText,
  Plug,
  TrendingUp,
  AlertTriangle,
  Users,
} from "lucide-react";
import { useInView } from "./use-in-view";
import { RunwayGauge } from "./feature-visuals";

/* Product tour (Workbench). The runway tracker is shown working; the supporting
   capabilities sit beneath it as a flat feature list — icons inline with the
   heading, hairline borders, no gradient-hover icon-tiles. */

const runwayPoints = [
  { icon: TrendingUp, text: "Live burn rate, recalculated as data lands" },
  { icon: AlertTriangle, text: "Threshold alerts before you cross them" },
  { icon: Users, text: "Benchmarks against companies at your stage" },
];

const capabilities = [
  {
    icon: GitBranch,
    title: "Scenario planning",
    description: "Ask “what if” in plain English — it builds the scenario.",
  },
  {
    icon: BarChart3,
    title: "Revenue intelligence",
    description: "Revenue that explains its own movements.",
  },
  {
    icon: FileText,
    title: "Investor reports",
    description: "A board update, drafted for you from live numbers.",
  },
  {
    icon: Plug,
    title: "Connected accounts",
    description: "Link your accounts; the numbers keep themselves current.",
  },
];

export function FeatureBento() {
  const { ref: gaugeRef, inView: gaugeInView } = useInView(0.2);

  return (
    <section id="product" className="pb-24 pt-6 sm:pb-32 sm:pt-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header — left aligned */}
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-surface-900 sm:text-4xl">
            Your numbers, thinking for themselves
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-surface-600">
            burnless keeps every number current and reads the trend for you — so you
            spend your time deciding, not reconciling.
          </p>
        </div>

        {/* Runway showcase */}
        <div
          ref={gaugeRef}
          className="mt-16 grid grid-cols-1 items-center gap-10 rounded-2xl border border-surface-200 bg-surface-50/60 p-6 sm:p-10 lg:grid-cols-2"
        >
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-surface-900">
              Never be surprised by zero
            </h3>
            <p className="mt-3 leading-relaxed text-surface-600">
              Real-time runway tracking with intelligent alerts. Know exactly when to
              fundraise, cut, or push on revenue — long before it&rsquo;s urgent.
            </p>
            <ul className="mt-6 space-y-3">
              {runwayPoints.map((point) => (
                <li key={point.text} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                    <point.icon className="h-3.5 w-3.5 text-brand-600" />
                  </span>
                  <span className="text-sm font-medium text-surface-700">{point.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <RunwayGauge visible={gaugeInView} />
        </div>

        {/* Capabilities — flat feature list, 2×2 */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {capabilities.map((cap) => (
            <div
              key={cap.title}
              className="group rounded-2xl border border-surface-200 bg-surface-0 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-surface-300 hover:shadow-lg"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 transition-transform duration-300 group-hover:scale-110">
                  <cap.icon className="h-4 w-4 text-brand-600" />
                </span>
                <h3 className="text-base font-semibold text-surface-900">{cap.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-surface-600">{cap.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
