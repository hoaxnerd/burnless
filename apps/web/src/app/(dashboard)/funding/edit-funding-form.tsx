"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import { validateField, validateAll, fundingFormSchema } from "@/lib/form-validation";

const ROUND_TYPES = [
  { value: "pre_seed", label: "Pre-Seed" },
  { value: "seed", label: "Seed" },
  { value: "series_a", label: "Series A" },
  { value: "series_b", label: "Series B" },
  { value: "series_c_plus", label: "Series C+" },
  { value: "debt", label: "Debt / Line of Credit" },
  { value: "grant", label: "Grant" },
] as const;

export interface EditFundingData {
  id: string;
  name: string;
  type: string;
  amount: number;
  date: string;
  preMoneyValuation: number | null;
  dilutionPercent: number | null;
  isProjected: boolean;
}

interface EditFundingFormProps {
  round: EditFundingData;
  open: boolean;
  onClose: () => void;
}

export function EditFundingForm({ round, open, onClose }: EditFundingFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [name, setName] = useState(round.name);
  const [type, setType] = useState(round.type);
  const [amount, setAmount] = useState(String(round.amount));
  const [date, setDate] = useState(
    round.date ? new Date(round.date).toISOString().split("T")[0]! : ""
  );
  const [preMoneyValuation, setPreMoneyValuation] = useState(
    round.preMoneyValuation != null ? String(round.preMoneyValuation) : ""
  );
  const [dilutionPercent, setDilutionPercent] = useState(
    round.dilutionPercent != null ? String(round.dilutionPercent) : ""
  );
  const [isProjected, setIsProjected] = useState(round.isProjected);

  function handleBlur(field: string, value: string) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const err = validateField(fundingFormSchema, field, value);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (err) next[field] = err;
      else delete next[field];
      return next;
    });
  }

  function handleChangeWithValidation(field: string, value: string) {
    if (touched[field]) {
      const err = validateField(fundingFormSchema, field, value);
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

    const errors = validateAll(fundingFormSchema, { name, amount, date, preMoneyValuation, dilutionPercent });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setTouched({ name: true, amount: true, date: true, preMoneyValuation: true, dilutionPercent: true });
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(`/api/funding-rounds/${round.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          amount: Number(amount),
          date,
          preMoneyValuation: preMoneyValuation ? Number(preMoneyValuation) : null,
          dilutionPercent: dilutionPercent ? Number(dilutionPercent) : null,
          isProjected,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update funding round");
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
    <Modal open={open} onClose={onClose} title={`Edit: ${round.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Round Name</label>
          <input type="text" value={name} onChange={(e) => { setName(e.target.value); handleChangeWithValidation("name", e.target.value); }}
            onBlur={() => handleBlur("name", name)} required
            className={`w-full rounded-lg border ${touched.name && fieldErrors.name ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
          {touched.name && fieldErrors.name && (
            <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.name}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500">
            {ROUND_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Amount ($)</label>
          <input type="number" value={amount} onChange={(e) => { setAmount(e.target.value); handleChangeWithValidation("amount", e.target.value); }}
            onBlur={() => handleBlur("amount", amount)} required min="0" step="1"
            className={`w-full rounded-lg border ${touched.amount && fieldErrors.amount ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
          {touched.amount && fieldErrors.amount && (
            <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.amount}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); handleChangeWithValidation("date", e.target.value); }}
            onBlur={() => handleBlur("date", date)} required
            className={`w-full rounded-lg border ${touched.date && fieldErrors.date ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
          {touched.date && fieldErrors.date && (
            <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.date}</p>
          )}
        </div>

        {type !== "debt" && type !== "grant" && (
          <>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Pre-Money Valuation ($) <span className="text-surface-400 font-normal">(optional)</span>
              </label>
              <input type="number" value={preMoneyValuation} onChange={(e) => { setPreMoneyValuation(e.target.value); handleChangeWithValidation("preMoneyValuation", e.target.value); }}
                onBlur={() => handleBlur("preMoneyValuation", preMoneyValuation)} min="0" step="1"
                className={`w-full rounded-lg border ${touched.preMoneyValuation && fieldErrors.preMoneyValuation ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Dilution (%) <span className="text-surface-400 font-normal">(optional)</span>
              </label>
              <input type="number" value={dilutionPercent} onChange={(e) => { setDilutionPercent(e.target.value); handleChangeWithValidation("dilutionPercent", e.target.value); }}
                onBlur={() => handleBlur("dilutionPercent", dilutionPercent)} min="0" max="100" step="0.01"
                className={`w-full rounded-lg border ${touched.dilutionPercent && fieldErrors.dilutionPercent ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
            </div>
          </>
        )}

        <div className="flex items-center gap-2">
          <input type="checkbox" id="editIsProjected" checked={isProjected}
            onChange={(e) => setIsProjected(e.target.checked)}
            className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
          <label htmlFor="editIsProjected" className="text-sm text-surface-700">
            This is a projected/planned round (not yet closed)
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving || !name || !amount || Object.keys(fieldErrors).length > 0}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50">
            {saving ? "Saving..." : "Update Round"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
