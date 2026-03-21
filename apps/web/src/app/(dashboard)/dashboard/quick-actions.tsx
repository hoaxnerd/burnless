"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import {
  Plus,
  TrendingUp,
  GitBranch,
  Sparkles,
  Upload,
  FileText,
} from "lucide-react";

interface QuickActionsProps {
  scenarioId: string;
  accounts: Array<{ id: string; name: string; category: string }>;
  /** Context signals for smart action ordering */
  context?: {
    hasRevenue: boolean;
    hasMultipleScenarios: boolean;
    burnRate: number;
    runway: number;
  };
}

export function QuickActions({ scenarioId, accounts: _accounts, context }: QuickActionsProps) {
  const router = useRouter();
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [revenueOpen, setRevenueOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expense form
  const [expName, setExpName] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expCategory, setExpCategory] = useState("operating_expense");

  // Revenue form
  const [revName, setRevName] = useState("");
  const [revType, setRevType] = useState("subscription");
  const [revPrice, setRevPrice] = useState("");
  const [revCustomers, setRevCustomers] = useState("");

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const acctRes = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: expName, type: "expense", category: expCategory }),
      });
      if (!acctRes.ok) {
        const errData = await acctRes.json().catch(() => ({}));
        throw new Error(errData.error ?? "Failed to create account");
      }
      const acct = await acctRes.json();

      const now = new Date();
      const res = await fetch("/api/forecast-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId,
          accountId: acct.id,
          method: "fixed",
          parameters: { amount: Number(expAmount) },
          startDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? "Failed to add expense");
      }

      setExpName("");
      setExpAmount("");
      setExpenseOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function addRevenue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const params: Record<string, unknown> =
        revType === "subscription"
          ? {
              monthlyPrice: Number(revPrice),
              startingCustomers: Number(revCustomers || "0"),
              newCustomersPerMonth: 5,
              monthlyChurnRate: 0.03,
            }
          : { unitPrice: Number(revPrice), monthlyUnits: Number(revCustomers || "1") };

      const res = await fetch("/api/revenue-streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, name: revName, type: revType, parameters: params }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? "Failed to add revenue stream");
      }

      setRevName("");
      setRevPrice("");
      setRevCustomers("");
      setRevenueOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  // Build contextual action list — most useful actions first
  type Action = {
    key: string;
    label: string;
    icon: typeof Plus;
    onClick?: () => void;
    href?: string;
    primary?: boolean;
  };

  const actions: Action[] = [];

  // AI is always available and prominent
  actions.push({
    key: "ai",
    label: "Ask AI",
    icon: Sparkles,
    href: "/ai",
    primary: true,
  });

  // If no revenue yet, suggest adding it
  if (context && !context.hasRevenue) {
    actions.push({
      key: "revenue",
      label: "Add Revenue",
      icon: TrendingUp,
      onClick: () => setRevenueOpen(true),
    });
  }

  // Always show expense
  actions.push({
    key: "expense",
    label: "Add Expense",
    icon: Plus,
    onClick: () => setExpenseOpen(true),
  });

  // Revenue (if we have it, still available but lower priority)
  if (!context || context.hasRevenue) {
    actions.push({
      key: "revenue",
      label: "Add Revenue",
      icon: TrendingUp,
      onClick: () => setRevenueOpen(true),
    });
  }

  // Scenario
  if (!context || !context.hasMultipleScenarios) {
    actions.push({
      key: "scenario",
      label: "New Scenario",
      icon: GitBranch,
      href: "/scenarios",
    });
  }

  // Import
  actions.push({
    key: "import",
    label: "Import CSV",
    icon: Upload,
    href: "/expenses?import=true",
  });

  // Reports
  actions.push({
    key: "reports",
    label: "Reports",
    icon: FileText,
    href: "/reports",
  });

  return (
    <>
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-6 sm:mb-8 animate-slide-up stagger-5">
        {actions.slice(0, 5).map((action) => {
          const Icon = action.icon;
          const baseClasses = `
            inline-flex items-center gap-2 rounded-xl
            px-3.5 py-2 sm:px-4 sm:py-2.5
            text-xs sm:text-sm font-medium
            transition-all duration-200
            press-effect hover:-translate-y-0.5
          `;

          if (action.primary) {
            const cls = `${baseClasses} border border-accent-500/20 bg-accent-500/10 text-accent-600 hover:bg-accent-500/15 hover:border-accent-500/30`;
            return action.href ? (
              <a key={action.key} href={action.href} className={cls}>
                <Icon className="h-3.5 w-3.5" /> {action.label}
              </a>
            ) : (
              <button key={action.key} onClick={action.onClick} className={cls}>
                <Icon className="h-3.5 w-3.5" /> {action.label}
              </button>
            );
          }

          const cls = `${baseClasses} border border-surface-200 bg-surface-0 text-surface-600 hover:border-surface-300 hover:text-surface-900`;
          return action.href ? (
            <a key={action.key} href={action.href} className={cls}>
              <Icon className="h-3.5 w-3.5" /> {action.label}
            </a>
          ) : (
            <button key={action.key} onClick={action.onClick} className={cls}>
              <Icon className="h-3.5 w-3.5" /> {action.label}
            </button>
          );
        })}
      </div>

      {/* Quick Add Expense Modal */}
      <Modal open={expenseOpen} onClose={() => setExpenseOpen(false)} title="Quick Add Expense">
        <form onSubmit={addExpense} className="space-y-4">
          {error && (
            <div className="rounded-xl bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Name</label>
            <input
              type="text"
              value={expName}
              onChange={(e) => setExpName(e.target.value)}
              placeholder="e.g. AWS, Office Rent"
              required
              className="w-full rounded-xl border border-surface-300 bg-surface-0 px-3.5 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Monthly Amount ($)
            </label>
            <input
              type="number"
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              placeholder="5000"
              required
              min="0"
              step="0.01"
              className="w-full rounded-xl border border-surface-300 bg-surface-0 px-3.5 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Category</label>
            <select
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value)}
              className="w-full rounded-xl border border-surface-300 bg-surface-0 px-3.5 py-2.5 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              <option value="operating_expense">Operating Expense</option>
              <option value="cogs">Cost of Goods Sold</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setExpenseOpen(false)}
              className="rounded-xl border border-surface-300 px-4 py-2.5 text-sm font-medium text-surface-600 hover:bg-surface-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !expName || !expAmount}
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add Expense"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Quick Add Revenue Modal */}
      <Modal
        open={revenueOpen}
        onClose={() => setRevenueOpen(false)}
        title="Quick Add Revenue Stream"
      >
        <form onSubmit={addRevenue} className="space-y-4">
          {error && (
            <div className="rounded-xl bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Name</label>
            <input
              type="text"
              value={revName}
              onChange={(e) => setRevName(e.target.value)}
              placeholder="e.g. Pro Plan, Setup Fees"
              required
              className="w-full rounded-xl border border-surface-300 bg-surface-0 px-3.5 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Type</label>
            <select
              value={revType}
              onChange={(e) => setRevType(e.target.value)}
              className="w-full rounded-xl border border-surface-300 bg-surface-0 px-3.5 py-2.5 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              <option value="subscription">Subscription</option>
              <option value="one_time">One-Time</option>
              <option value="services">Services</option>
              <option value="usage_based">Usage-Based</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                {revType === "subscription" ? "Monthly Price ($)" : "Unit Price ($)"}
              </label>
              <input
                type="number"
                value={revPrice}
                onChange={(e) => setRevPrice(e.target.value)}
                placeholder="99"
                required
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-surface-300 bg-surface-0 px-3.5 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                {revType === "subscription" ? "Starting Customers" : "Units/Month"}
              </label>
              <input
                type="number"
                value={revCustomers}
                onChange={(e) => setRevCustomers(e.target.value)}
                placeholder={revType === "subscription" ? "50" : "10"}
                min="0"
                className="w-full rounded-xl border border-surface-300 bg-surface-0 px-3.5 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setRevenueOpen(false)}
              className="rounded-xl border border-surface-300 px-4 py-2.5 text-sm font-medium text-surface-600 hover:bg-surface-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !revName || !revPrice}
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add Stream"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
