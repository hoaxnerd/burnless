"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { useRouter } from "next/navigation";
import { Modal, Input, Select } from "@/components/ui";
import { toUserMessage } from "@/lib/api-error";
import {
  Plus,
  TrendingUp,
  GitBranch,
  Sparkles,
  Upload,
  FileText,
} from "lucide-react";
import { useAiFlags } from "@/components/ai/ai-feature-context";
import { buildRevenueStreamParams } from "@/lib/revenue-stream-params";

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
  const { companionName } = useAiFlags();
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
      const acctRes = await apiFetch("/api/accounts", {
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
      const res = await apiFetch("/api/forecast-lines", {
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
      setError(toUserMessage(err));
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
          ? buildRevenueStreamParams("subscription", {
              monthlyPrice: revPrice,
              startingCustomers: revCustomers || "0",
              newCustomersPerMonth: "5",
              monthlyChurnRate: "3",
            })
          : buildRevenueStreamParams("one_time", {
              unitPrice: revPrice,
              monthlyUnits: revCustomers || "1",
            });

      const res = await apiFetch("/api/revenue-streams", {
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
      setError(toUserMessage(err));
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
    label: `Ask ${companionName}`,
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
      <div className="flex flex-wrap gap-2 sm:gap-3 animate-slide-up stagger-5 content-start">
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
          <Input
            label="Name"
            type="text"
            value={expName}
            onChange={(e) => setExpName(e.target.value)}
            placeholder="e.g. AWS, Office Rent"
            required
          />
          <Input
            label="Monthly Amount ($)"
            type="number"
            value={expAmount}
            onChange={(e) => setExpAmount(e.target.value)}
            placeholder="5000"
            required
            min="0"
            step="0.01"
          />
          <Select
            label="Category"
            value={expCategory}
            onChange={(e) => setExpCategory(e.target.value)}
          >
            <option value="operating_expense">Operating Expense</option>
            <option value="cogs">Cost of Goods Sold</option>
          </Select>
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
          <Input
            label="Name"
            type="text"
            value={revName}
            onChange={(e) => setRevName(e.target.value)}
            placeholder="e.g. Pro Plan, Setup Fees"
            required
          />
          <Select
            label="Type"
            value={revType}
            onChange={(e) => setRevType(e.target.value)}
          >
            <option value="subscription">Subscription</option>
            <option value="one_time">One-Time</option>
            <option value="services">Services</option>
            <option value="usage_based">Usage-Based</option>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={revType === "subscription" ? "Monthly Price ($)" : "Unit Price ($)"}
              type="number"
              value={revPrice}
              onChange={(e) => setRevPrice(e.target.value)}
              placeholder="99"
              required
              min="0"
              step="0.01"
            />
            <Input
              label={revType === "subscription" ? "Starting Customers" : "Units/Month"}
              type="number"
              value={revCustomers}
              onChange={(e) => setRevCustomers(e.target.value)}
              placeholder={revType === "subscription" ? "50" : "10"}
              min="0"
            />
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
