"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import { Plus, TrendingUp, GitBranch, Sparkles } from "lucide-react";

interface QuickActionsProps {
  scenarioId: string;
  accounts: Array<{ id: string; name: string; category: string }>;
}

export function QuickActions({ scenarioId, accounts }: QuickActionsProps) {
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

  const expenseAccounts = accounts.filter(
    (a) => a.category === "operating_expense" || a.category === "cogs"
  );

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      // Create account
      const acctRes = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: expName, type: "expense", category: expCategory }),
      });
      if (!acctRes.ok) throw new Error("Failed to create account");
      const acct = await acctRes.json();

      // Create forecast line
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
      if (!res.ok) throw new Error("Failed to add expense");

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
      const params: Record<string, unknown> = revType === "subscription"
        ? { monthlyPrice: Number(revPrice), startingCustomers: Number(revCustomers || "0"), newCustomersPerMonth: 5, monthlyChurnRate: 0.03 }
        : { unitPrice: Number(revPrice), monthlyUnits: Number(revCustomers || "1") };

      const res = await fetch("/api/revenue-streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, name: revName, type: revType, parameters: params }),
      });
      if (!res.ok) throw new Error("Failed to add revenue stream");

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

  return (
    <>
      <div className="flex flex-wrap gap-3 mb-8">
        <button
          onClick={() => setExpenseOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-surface-200 bg-surface-0 px-4 py-2.5 text-sm font-medium text-surface-700 hover:border-brand-300 hover:text-brand-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add Expense
        </button>
        <button
          onClick={() => setRevenueOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-surface-200 bg-surface-0 px-4 py-2.5 text-sm font-medium text-surface-700 hover:border-brand-300 hover:text-brand-700 transition-colors"
        >
          <TrendingUp className="h-3.5 w-3.5" /> Add Revenue
        </button>
        <a
          href="/scenarios"
          className="inline-flex items-center gap-2 rounded-lg border border-surface-200 bg-surface-0 px-4 py-2.5 text-sm font-medium text-surface-700 hover:border-brand-300 hover:text-brand-700 transition-colors"
        >
          <GitBranch className="h-3.5 w-3.5" /> New Scenario
        </a>
        <a
          href="/ai"
          className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-100 transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5" /> Ask AI
        </a>
      </div>

      {/* Quick Add Expense Modal */}
      <Modal open={expenseOpen} onClose={() => setExpenseOpen(false)} title="Quick Add Expense">
        <form onSubmit={addExpense} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Name</label>
            <input type="text" value={expName} onChange={(e) => setExpName(e.target.value)}
              placeholder="e.g. AWS, Office Rent" required
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Monthly Amount ($)</label>
            <input type="number" value={expAmount} onChange={(e) => setExpAmount(e.target.value)}
              placeholder="5000" required min="0" step="0.01"
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Category</label>
            <select value={expCategory} onChange={(e) => setExpCategory(e.target.value)}
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="operating_expense">Operating Expense</option>
              <option value="cogs">Cost of Goods Sold</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setExpenseOpen(false)}
              className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving || !expName || !expAmount}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50">
              {saving ? "Adding..." : "Add Expense"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Quick Add Revenue Modal */}
      <Modal open={revenueOpen} onClose={() => setRevenueOpen(false)} title="Quick Add Revenue Stream">
        <form onSubmit={addRevenue} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Name</label>
            <input type="text" value={revName} onChange={(e) => setRevName(e.target.value)}
              placeholder="e.g. Pro Plan, Setup Fees" required
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Type</label>
            <select value={revType} onChange={(e) => setRevType(e.target.value)}
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="subscription">Subscription</option>
              <option value="one_time">One-Time</option>
              <option value="services">Services</option>
              <option value="usage_based">Usage-Based</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                {revType === "subscription" ? "Monthly Price ($)" : "Unit Price ($)"}
              </label>
              <input type="number" value={revPrice} onChange={(e) => setRevPrice(e.target.value)}
                placeholder="99" required min="0" step="0.01"
                className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                {revType === "subscription" ? "Starting Customers" : "Units/Month"}
              </label>
              <input type="number" value={revCustomers} onChange={(e) => setRevCustomers(e.target.value)}
                placeholder={revType === "subscription" ? "50" : "10"} min="0"
                className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setRevenueOpen(false)}
              className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving || !revName || !revPrice}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50">
              {saving ? "Adding..." : "Add Stream"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
