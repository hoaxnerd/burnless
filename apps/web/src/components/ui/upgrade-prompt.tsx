"use client";

/**
 * UpgradePrompt — non-disruptive CTA shown when a user hits a plan limit.
 *
 * Two variants:
 * - `inline`: renders as a banner within the page flow
 * - `modal`: renders as a centered overlay (uses the Modal component)
 *
 * The backend returns { error, upgradeTarget, code: "PLAN_LIMIT_REACHED" }
 * on 403. This component consumes that shape via the `usePlanLimit` hook.
 */

import { Sparkles, ArrowRight, X } from "lucide-react";
import { useState, type ReactNode } from "react";

export interface PlanLimitInfo {
  /** Human-readable reason, e.g. "Free plan is limited to 1 scenario." */
  message: string;
  /** Which plan to upgrade to */
  upgradeTarget: "pro" | "team";
}

// ── Inline Banner ───────────────────────────────────────────────────────────

interface UpgradePromptProps {
  limit: PlanLimitInfo;
  /** Optional extra context shown below the message */
  children?: ReactNode;
  /** Allow dismissing the banner */
  dismissable?: boolean;
  onDismiss?: () => void;
}

export function UpgradePrompt({ limit, children, dismissable, onDismiss }: UpgradePromptProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const planName = limit.upgradeTarget === "team" ? "Team" : "Pro";

  return (
    <div className="relative rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-violet-50 p-5 sm:p-6">
      {dismissable && (
        <button
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
          className="absolute top-3 right-3 rounded-lg p-1 text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100">
          <Sparkles className="h-4.5 w-4.5 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-surface-900">
            Upgrade to {planName}
          </p>
          <p className="mt-1 text-sm text-surface-600 leading-relaxed">
            {limit.message}
          </p>
          {children}
          <a
            href={`/settings?tab=billing&upgrade=${limit.upgradeTarget}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700 hover:shadow-md hover:shadow-brand-600/25 transition-all"
          >
            Upgrade to {planName}
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Compact Inline (for tight spaces like within forms) ─────────────────────

export function UpgradePromptCompact({ limit }: { limit: PlanLimitInfo }) {
  const planName = limit.upgradeTarget === "team" ? "Team" : "Pro";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-3">
      <Sparkles className="h-4 w-4 shrink-0 text-brand-600" />
      <p className="flex-1 text-sm text-surface-700">{limit.message}</p>
      <a
        href={`/settings?tab=billing&upgrade=${limit.upgradeTarget}`}
        className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
      >
        Upgrade to {planName}
      </a>
    </div>
  );
}
