"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  MessageSquare,
  GitBranch,
  FileBarChart,
  AlertTriangle,
  ArrowRight,
  Bot,
} from "lucide-react";
import { AiGate } from "@/components/ai/ai-gate";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface AiCommandCenterProps {
  runway: number;
  burnRate: number;
  mrr: number;
  mrrGrowth: number;
  cash: number;
}

interface AlertData {
  id: string;
  severity: string;
  title: string;
  message: string;
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

function generateSummary(
  runway: number,
  burnRate: number,
  mrr: number,
  mrrGrowth: number,
  cash: number,
): string {
  const parts: string[] = [];

  // Lead with the most important signal
  if (runway > 0 && runway <= 6) {
    parts.push(
      `Your runway is at ${Math.round(runway)} months — time to act on fundraising or cost reduction.`,
    );
  } else if (runway > 0 && runway < 999) {
    parts.push(`Your runway looks healthy at ${Math.round(runway)} months.`);
  } else if (runway >= 999 && cash > 0) {
    parts.push(`You're cash-flow positive with ${formatCompact(cash)} in the bank.`);
  }

  // MRR growth signal
  if (mrrGrowth > 10) {
    parts.push(`MRR grew ${mrrGrowth.toFixed(0)}% this month — exceptional momentum.`);
  } else if (mrrGrowth > 5) {
    parts.push(`MRR grew ${mrrGrowth.toFixed(0)}% this month — strong and steady.`);
  } else if (mrrGrowth > 0 && mrr > 0) {
    parts.push(`MRR is up ${mrrGrowth.toFixed(1)}% month-over-month.`);
  } else if (mrrGrowth < -5 && mrr > 0) {
    parts.push(`MRR declined ${Math.abs(mrrGrowth).toFixed(1)}% — worth investigating.`);
  }

  // Burn context
  if (burnRate > 0 && parts.length < 2) {
    parts.push(`Monthly burn is ${formatCompact(burnRate)}.`);
  }

  return parts.join(" ") || `You have ${formatCompact(cash)} in cash with ${formatCompact(burnRate)}/mo burn.`;
}

/** Dispatch a custom event to open the global AI panel from the dashboard shell. */
function openAiPanel() {
  window.dispatchEvent(new CustomEvent("burnless:open-ai-panel"));
}

/* ── Quick Action Cards ────────────────────────────────────────────────────── */

const quickActions = [
  {
    id: "ask",
    title: "Quick Ask",
    description: "Ask anything about your finances",
    icon: MessageSquare,
    gradientFrom: "from-brand-500",
    gradientTo: "to-blue-500",
    glowColor: "group-hover:shadow-brand-500/25",
    onClick: () => openAiPanel(),
  },
  {
    id: "scenario",
    title: "Build Scenario",
    description: "Model a what-if projection",
    icon: GitBranch,
    gradientFrom: "from-violet-500",
    gradientTo: "to-fuchsia-500",
    glowColor: "group-hover:shadow-violet-500/25",
    href: "/scenarios/new",
  },
  {
    id: "report",
    title: "Generate Report",
    description: "One-click board deck",
    icon: FileBarChart,
    gradientFrom: "from-emerald-500",
    gradientTo: "to-teal-500",
    glowColor: "group-hover:shadow-emerald-500/25",
    href: "/reports",
  },
] as const;

/* ── Component ─────────────────────────────────────────────────────────────── */

export function AiCommandCenter({
  runway,
  burnRate,
  mrr,
  mrrGrowth,
  cash,
}: AiCommandCenterProps) {
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [alertsLoaded, setAlertsLoaded] = useState(false);

  // Fetch anomaly alerts
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/alerts", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.alerts) {
          setAlerts(
            data.alerts.filter(
              (a: AlertData) => a.severity === "critical" || a.severity === "warning",
            ),
          );
        }
      })
      .catch(() => {})
      .finally(() => setAlertsLoaded(true));
    return () => controller.abort();
  }, []);

  const summary = generateSummary(runway, burnRate, mrr, mrrGrowth, cash);

  return (
    <AiGate feature="insights" hideWhenOff>
      <div className="relative mb-6 animate-slide-up">
        {/* Gradient border wrapper */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-brand-500/20 via-violet-500/20 to-brand-500/10 pointer-events-none" />

        {/* Main card */}
        <div className="relative rounded-2xl bg-surface-0 overflow-hidden">
          {/* Ambient glow */}
          <div
            className="absolute inset-0 bg-gradient-to-br from-brand-500/[0.03] via-transparent to-violet-500/[0.03] pointer-events-none"
            style={{ animation: "ambientBreath 6s ease-in-out infinite" }}
          />

          <div className="relative p-5 sm:p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 opacity-20 blur-sm" />
                  <div className="relative rounded-xl bg-gradient-to-br from-brand-500/10 to-violet-500/10 p-2">
                    <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-brand-500" />
                  </div>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-surface-900">
                    AI Financial Companion
                  </h2>
                  <p className="text-[10px] text-surface-400 mt-0.5">
                    Powered by your live data
                  </p>
                </div>
              </div>

              <button
                onClick={openAiPanel}
                className="inline-flex items-center gap-1.5 rounded-xl border border-brand-500/20 bg-brand-500/10 px-3.5 py-2 text-xs font-medium text-brand-600 hover:bg-brand-500/15 hover:border-brand-500/30 transition-all duration-200 press-effect"
              >
                <Bot className="h-3.5 w-3.5" />
                Talk to AI
              </button>
            </div>

            {/* AI Summary */}
            <div className="mb-5 rounded-xl bg-surface-50/80 border border-surface-100 p-3.5 sm:p-4">
              <p className="text-sm text-surface-700 leading-relaxed">
                <span className="text-surface-400 mr-1.5">&ldquo;</span>
                {summary}
                <span className="text-surface-400 ml-1">&rdquo;</span>
              </p>
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                const inner = (
                  <div
                    className={`group relative rounded-xl border border-surface-200 bg-surface-0 p-4 transition-all duration-300 hover:border-surface-300 hover:-translate-y-0.5 hover:shadow-lg ${action.glowColor} cursor-pointer`}
                  >
                    {/* Icon with gradient background */}
                    <div
                      className={`inline-flex rounded-lg bg-gradient-to-br ${action.gradientFrom} ${action.gradientTo} p-2 mb-3`}
                    >
                      <Icon className="h-4 w-4 text-white" />
                    </div>

                    <h3 className="text-sm font-semibold text-surface-900 mb-0.5">
                      {action.title}
                    </h3>
                    <p className="text-xs text-surface-400 leading-relaxed">
                      {action.description}
                    </p>

                    {/* Hover arrow indicator */}
                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <ArrowRight className="h-3.5 w-3.5 text-surface-300" />
                    </div>
                  </div>
                );

                if ("href" in action && action.href) {
                  return (
                    <Link key={action.id} href={action.href}>
                      {inner}
                    </Link>
                  );
                }

                return (
                  <div key={action.id} onClick={action.onClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") action.onClick?.(); }}>
                    {inner}
                  </div>
                );
              })}
            </div>

            {/* Anomaly Alert Row */}
            {alertsLoaded && alerts.length > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-warning-500/20 bg-warning-50/50 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg bg-warning-500/10 p-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning-500" />
                  </div>
                  <span className="text-sm font-medium text-surface-700">
                    {alerts.length === 1
                      ? "1 anomaly detected"
                      : `${alerts.length} anomalies detected`}
                  </span>
                </div>
                <button
                  onClick={openAiPanel}
                  className="inline-flex items-center gap-1 text-xs font-medium text-warning-600 hover:text-warning-700 transition-colors"
                >
                  View <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AiGate>
  );
}
