"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import { validateField, validateAll, expenseFormSchema } from "@/lib/form-validation";
import type { ExpenseLineItem } from "@/lib/compute-expenses";

const EXPENSE_SUBCATEGORIES = [
  { value: "Software & Tools", label: "Software & Tools", parent: "operating_expense" },
  { value: "Payroll", label: "Payroll", parent: "operating_expense" },
  { value: "Office & Facilities", label: "Office & Facilities", parent: "operating_expense" },
  { value: "Marketing", label: "Marketing", parent: "operating_expense" },
  { value: "Payment Processing", label: "Payment Processing", parent: "operating_expense" },
  { value: "Legal & Compliance", label: "Legal & Compliance", parent: "operating_expense" },
  { value: "Travel & Entertainment", label: "Travel & Entertainment", parent: "operating_expense" },
  { value: "Insurance", label: "Insurance", parent: "operating_expense" },
  { value: "Professional Services", label: "Professional Services", parent: "operating_expense" },
  { value: "Cost of Goods Sold", label: "Cost of Goods Sold", parent: "cogs" },
  { value: "Other Operating Expense", label: "Other Operating Expense", parent: "operating_expense" },
] as const;

const METHODS = [
  { value: "fixed", label: "Fixed Amount" },
  { value: "growth_rate", label: "Growth Rate" },
] as const;

interface EditExpenseFormProps {
  item: ExpenseLineItem;
  open: boolean;
  onClose: () => void;
}

export function EditExpenseForm({ item, open, onClose }: EditExpenseFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Pre-populate from existing item
  const [subcategory, setSubcategory] = useState(() => {
    // Map known subcategories, handle legacy "Other" values
    const current = item.subcategory;
    if (current === "Other" || current === "Uncategorized") return "Other Operating Expense";
    const match = EXPENSE_SUBCATEGORIES.find((c) => c.value === current);
    return match ? current : "Other Operating Expense";
  });
  const [method, setMethod] = useState(item.method);
  const [amount, setAmount] = useState(
    String(item.parameters.amount ?? item.currentAmount)
  );
  const [growthRate, setGrowthRate] = useState(
    item.parameters.growthRate
      ? String(Number(item.parameters.growthRate) * 100)
      : ""
  );
  const [startDate, setStartDate] = useState(item.startDate);

  function handleBlur(field: string, value: string) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const err = validateField(expenseFormSchema, field, value);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (err) next[field] = err;
      else delete next[field];
      return next;
    });
  }

  function handleFieldChange(field: string, value: string) {
    if (touched[field]) {
      const err = validateField(expenseFormSchema, field, value);
      setFieldErrors((prev) => {
        const next = { ...prev };
        if (err) next[field] = err;
        else delete next[field];
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const errors = validateAll(expenseFormSchema, { name: item.accountName, amount, startDate });
    if (errors.amount || errors.startDate) {
      setFieldErrors(errors);
      setTouched((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(errors)) next[key] = true;
        return next;
      });
      return;
    }

    setSaving(true);

    try {
      const params: Record<string, unknown> = { amount: Number(amount) };
      if (method === "growth_rate" && growthRate) {
        params.growthRate = Number(growthRate) / 100;
      }

      const res = await apiFetch(`/api/forecast-lines/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          parameters: params,
          startDate,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update expense");
      }

      // Update account category + save subcategory via merchant mapping if changed
      if (subcategory !== item.subcategory) {
        const parentCategory = EXPENSE_SUBCATEGORIES.find((c) => c.value === subcategory)?.parent ?? "operating_expense";

        // Update the account's category if parent changed (operating_expense <-> cogs)
        if (parentCategory !== item.accountCategory) {
          await apiFetch(`/api/accounts/${item.accountId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category: parentCategory }),
          });
        }

        // Save merchant mapping for future auto-categorization
        if (item.accountName.length >= 3) {
          apiFetch("/api/merchant-mappings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: item.accountName,
              accountId: item.accountId,
              category: parentCategory,
              subcategory,
            }),
          }).catch(() => {}); // fire-and-forget
        }
      }

      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Edit: ${item.accountName}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Name</label>
          <input
            type="text"
            value={item.accountName}
            disabled
            className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-500 cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-surface-400">
            Name is tied to the account and cannot be changed here.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Category</label>
          <select
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {EXPENSE_SUBCATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Monthly Amount ($)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              handleFieldChange("amount", e.target.value);
            }}
            onBlur={() => handleBlur("amount", amount)}
            placeholder="5000"
            required
            min="0"
            step="0.01"
            className={`w-full rounded-lg border ${touched.amount && fieldErrors.amount ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`}
          />
          {touched.amount && fieldErrors.amount && (
            <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.amount}</p>
          )}
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
            onChange={(e) => {
              setStartDate(e.target.value);
              handleFieldChange("startDate", e.target.value);
            }}
            onBlur={() => handleBlur("startDate", startDate)}
            required
            className={`w-full rounded-lg border ${touched.startDate && fieldErrors.startDate ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`}
          />
          {touched.startDate && fieldErrors.startDate && (
            <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.startDate}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !amount || Object.keys(fieldErrors).length > 0}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
