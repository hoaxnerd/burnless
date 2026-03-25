"use client";

import { useState } from "react";
import { Loader2, Check, ExternalLink, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useBilling, billingAction } from "@/lib/swr";

const TIERS = [
  {
    key: "free" as const,
    name: "Free",
    price: "$0",
    period: "forever",
    features: [
      "1 scenario",
      "10 AI messages / month",
      "3 exports / month",
      "CSV import",
    ],
  },
  {
    key: "pro" as const,
    name: "Pro",
    price: "$29",
    period: "/month",
    popular: true,
    features: [
      "Unlimited scenarios",
      "Unlimited AI companion",
      "PDF & CSV export",
      "Data room",
      "Priority support",
    ],
  },
  {
    key: "team" as const,
    name: "Team",
    price: "$79",
    period: "/month + $20/seat",
    features: [
      "Everything in Pro",
      "Team collaboration",
      "Role-based access",
      "Audit log",
      "Custom integrations",
    ],
  },
];

export function BillingTab() {
  const { data: billing, isLoading: loading } = useBilling();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { success: toastSuccess, error: toastError } = useToast();

  const handleUpgrade = async (plan: "pro" | "team") => {
    setActionLoading(plan);
    try {
      const data = await billingAction("checkout", { plan });
      if (data.url) {
        window.location.href = data.url;
      } else {
        toastError("Failed to start checkout");
      }
    } catch {
      toastError("Unable to connect to billing service");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePortal = async () => {
    setActionLoading("portal");
    try {
      const data = await billingAction("portal");
      if (data.url) {
        window.location.href = data.url;
      } else {
        toastError("Failed to open billing portal");
      }
    } catch {
      toastError("Unable to connect to billing service");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    setActionLoading("cancel");
    try {
      await billingAction("cancel");
      toastSuccess("Subscription will cancel at the end of the billing period");
    } catch {
      toastError("Unable to connect to billing service");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async () => {
    setActionLoading("reactivate");
    try {
      await billingAction("reactivate");
      toastSuccess("Subscription reactivated");
    } catch {
      toastError("Unable to connect to billing service");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-surface-400" />
      </div>
    );
  }

  const currentPlan = billing?.plan ?? "free";
  const _isActive = billing?.status === "active" || billing?.status === "trialing";
  const isPastDue = billing?.status === "past_due";

  return (
    <div className="max-w-3xl space-y-8">
      {/* Current plan status */}
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-surface-900">
            Current Plan
          </h2>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
              currentPlan === "free"
                ? "bg-surface-100 text-surface-600"
                : isPastDue
                  ? "bg-warning-50 text-warning-700"
                  : "bg-brand-50 text-brand-700"
            }`}
          >
            {currentPlan === "free" ? "Free" : currentPlan === "pro" ? "Pro" : "Team"}
            {isPastDue && " — Past Due"}
          </span>
        </div>

        {currentPlan === "free" ? (
          <p className="text-sm text-surface-500">
            You&apos;re on the free plan. Upgrade to unlock unlimited scenarios, AI
            companion, and export features.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-surface-500">
              {billing?.cancelAtPeriodEnd
                ? `Your ${currentPlan === "pro" ? "Pro" : "Team"} plan is active until ${
                    billing.currentPeriodEnd
                      ? new Date(billing.currentPeriodEnd).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "the end of the billing period"
                  }. After that, you'll be downgraded to Free.`
                : `Your ${currentPlan === "pro" ? "Pro" : "Team"} plan is active.${
                    billing?.currentPeriodEnd
                      ? ` Next billing date: ${new Date(billing.currentPeriodEnd).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}`
                      : ""
                  }`}
            </p>
            {isPastDue && (
              <div className="flex items-center gap-2 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Payment failed. Please update your payment method to keep your plan active.
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={handlePortal}
                disabled={actionLoading === "portal"}
                className="flex items-center gap-1.5 rounded-xl border border-surface-300 px-4 py-2 text-xs font-medium text-surface-700 hover:bg-surface-50 hover:border-surface-400 transition-colors disabled:opacity-50"
              >
                {actionLoading === "portal" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                Manage Billing
              </button>
              {billing?.cancelAtPeriodEnd ? (
                <button
                  onClick={handleReactivate}
                  disabled={actionLoading === "reactivate"}
                  className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                >
                  {actionLoading === "reactivate" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Reactivate
                </button>
              ) : (
                <button
                  onClick={handleCancel}
                  disabled={actionLoading === "cancel"}
                  className="flex items-center gap-1.5 rounded-xl border border-danger-200 px-4 py-2 text-xs font-medium text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-50"
                >
                  {actionLoading === "cancel" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Cancel Subscription
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Usage (for non-free plans) */}
      {billing && currentPlan !== "free" && (
        <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
          <h2 className="text-base font-semibold text-surface-900 mb-4">Usage This Month</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Scenarios", ...billing.usage.scenarios },
              { label: "AI Messages", ...billing.usage.aiMessages },
              { label: "Exports", ...billing.usage.exports },
            ].map((u) => (
              <div key={u.label} className="rounded-xl bg-surface-50 p-4">
                <p className="text-xs text-surface-500 mb-1">{u.label}</p>
                <p className="text-lg font-bold text-surface-900 tabular-nums">
                  {u.used}
                  <span className="text-sm font-normal text-surface-400">
                    {u.limit === -1 ? " / unlimited" : ` / ${u.limit}`}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pricing tiers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        {TIERS.map((tier) => {
          const isCurrent = tier.key === currentPlan;
          return (
            <div
              key={tier.key}
              className={`rounded-2xl border p-6 sm:p-7 transition-all ${
                tier.popular
                  ? "border-brand-500 bg-brand-50/50 shadow-md shadow-brand-500/10 relative"
                  : "border-surface-200 bg-surface-0 hover:border-surface-300"
              }`}
            >
              {tier.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-brand-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                  Most Popular
                </span>
              )}
              <h3 className="text-lg font-bold text-surface-900">
                {tier.name}
              </h3>
              <div className="mt-3 mb-5">
                <span className="text-3xl font-bold text-surface-900 tabular-nums">
                  {tier.price}
                </span>
                <span className="text-sm text-surface-500 ml-1">
                  {tier.period}
                </span>
              </div>
              <ul className="space-y-2.5 mb-7">
                {tier.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2.5 text-sm text-surface-600"
                  >
                    <Check className="h-4 w-4 text-success-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                disabled={isCurrent || actionLoading === tier.key}
                onClick={() => {
                  if (tier.key !== "free") handleUpgrade(tier.key);
                }}
                className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                  isCurrent
                    ? "bg-surface-100 text-surface-400 cursor-not-allowed"
                    : tier.popular
                      ? "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20 hover:shadow-md hover:shadow-brand-600/25 disabled:opacity-50"
                      : tier.key === "free"
                        ? "bg-surface-100 text-surface-400 cursor-not-allowed"
                        : "border border-surface-300 text-surface-700 hover:bg-surface-50 hover:border-surface-400 disabled:opacity-50"
                }`}
              >
                {isCurrent ? (
                  "Current Plan"
                ) : actionLoading === tier.key ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : tier.key === "free" ? (
                  "Free Forever"
                ) : (
                  "Upgrade"
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
