"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import { Plus, Sparkles, Check } from "lucide-react";
import { categorizeTransaction } from "@burnless/engine";

const CATEGORIES = [
  { value: "operating_expense", label: "Operating Expense" },
  { value: "cogs", label: "Cost of Goods Sold" },
] as const;

const METHODS = [
  { value: "fixed", label: "Fixed Amount" },
  { value: "growth_rate", label: "Growth Rate" },
] as const;

interface AddExpenseFormProps {
  scenarioId: string;
  accounts: Array<{ id: string; name: string; category: string }>;
}

export function AddExpenseForm({ scenarioId, accounts }: AddExpenseFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [category, setCategory] = useState<string>("operating_expense");
  const [method, setMethod] = useState("fixed");
  const [amount, setAmount] = useState("");
  const [growthRate, setGrowthRate] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });

  const [suggestion, setSuggestion] = useState<{ subcategory: string; category: string; confidence: number } | null>(null);
  const [suggestionApplied, setSuggestionApplied] = useState(false);

  useEffect(() => {
    if (name.length < 3) {
      setSuggestion(null);
      setSuggestionApplied(false);
      return;
    }
    const result = categorizeTransaction(name);
    if (result && result.confidence >= 0.5) {
      setSuggestion({ subcategory: result.subcategory, category: result.category, confidence: result.confidence });
    } else {
      setSuggestion(null);
    }
    setSuggestionApplied(false);
  }, [name]);

  const applySuggestion = () => {
    if (!suggestion) return;
    if (suggestion.category === "cogs") setCategory("cogs");
    else setCategory("operating_expense");
    setSuggestionApplied(true);
  };

  const expenseAccounts = accounts.filter(
    (a) => a.category === "operating_expense" || a.category === "cogs"
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      let targetAccountId = accountId;
      if (!targetAccountId) {
        const acctRes = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, type: "expense", category }),
        });
        if (!acctRes.ok) throw new Error("Failed to create account");
        const acct = await acctRes.json();
        targetAccountId = acct.id;
      }

      const params: Record<string, unknown> = { amount: Number(amount) };
      if (method === "growth_rate" && growthRate) {
        params.growthRate = Number(growthRate) / 100;
      }

      const res = await fetch("/api/forecast-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, accountId: targetAccountId, method, parameters: params, startDate }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create expense");
      }

      setName("");
      setAccountId("");
      setAmount("");
      setGrowthRate("");
      setMethod("fixed");
      setSuggestion(null);
      setSuggestionApplied(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add Expense
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Expense">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AWS Hosting, Office Rent"
              required
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {suggestion && !suggestionApplied && (
              <button
                type="button"
                onClick={applySuggestion}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs text-brand-700 hover:bg-brand-100 transition-colors w-full"
              >
                <Sparkles className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">
                  Auto-detected: <strong>{suggestion.subcategory}</strong>
                </span>
                <span className="ml-auto text-[10px] text-brand-500 tabular-nums flex-shrink-0">
                  {(suggestion.confidence * 100).toFixed(0)}% confident
                </span>
              </button>
            )}
            {suggestionApplied && suggestion && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-700 w-full">
                <Check className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">
                  Categorized as <strong>{suggestion.subcategory}</strong>
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {expenseAccounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Account <span className="text-surface-400 font-normal">(optional)</span>
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Create new account</option>
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Monthly Amount ($)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="5000"
              required
              min="0"
              step="0.01"
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Type</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {method === "growth_rate" && (
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Monthly Growth Rate (%)</label>
              <input
                type="number"
                value={growthRate}
                onChange={(e) => setGrowthRate(e.target.value)}
                placeholder="5"
                step="0.1"
                className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name || !amount}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add Expense"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
