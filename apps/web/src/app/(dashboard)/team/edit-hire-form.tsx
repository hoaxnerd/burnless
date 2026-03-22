"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import { validateField, validateAll, hireFormSchema } from "@/lib/form-validation";

export interface EditHireData {
  id: string;
  title: string;
  count: number;
  salary: number;
  benefitsRate: number;
  startDate: string;
}

interface EditHireFormProps {
  hire: EditHireData;
  open: boolean;
  onClose: () => void;
}

export function EditHireForm({ hire, open, onClose }: EditHireFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [title, setTitle] = useState(hire.title);
  const [count, setCount] = useState(String(hire.count));
  const [salary, setSalary] = useState(String(hire.salary));
  const [benefitsRate, setBenefitsRate] = useState(String(Math.round(hire.benefitsRate * 100)));
  const [startDate, setStartDate] = useState(
    hire.startDate ? new Date(hire.startDate).toISOString().split("T")[0]! : ""
  );

  function handleBlur(field: string, value: string) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const err = validateField(hireFormSchema, field, value);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (err) next[field] = err;
      else delete next[field];
      return next;
    });
  }

  function handleChangeValidated(field: string, value: string) {
    if (touched[field]) {
      const err = validateField(hireFormSchema, field, value);
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

    const errors = validateAll(hireFormSchema, { title, count, salary, benefitsRate, startDate });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setTouched({ title: true, count: true, salary: true, benefitsRate: true, startDate: true });
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(`/api/headcount/${hire.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          count: Number(count),
          salary: Number(salary),
          startDate,
          benefitsRate: Number(benefitsRate) / 100,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update team member");
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
    <Modal open={open} onClose={onClose} title={`Edit: ${hire.title}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Role / Title</label>
          <input type="text" value={title}
            onChange={(e) => { setTitle(e.target.value); handleChangeValidated("title", e.target.value); }}
            onBlur={() => handleBlur("title", title)} required
            className={`w-full rounded-lg border ${touched.title && fieldErrors.title ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
          {touched.title && fieldErrors.title && (
            <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.title}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Count</label>
            <input type="number" value={count}
              onChange={(e) => { setCount(e.target.value); handleChangeValidated("count", e.target.value); }}
              onBlur={() => handleBlur("count", count)} required min="1" step="1"
              className={`w-full rounded-lg border ${touched.count && fieldErrors.count ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
            {touched.count && fieldErrors.count && (
              <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.count}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Annual Salary ($)</label>
            <input type="number" value={salary}
              onChange={(e) => { setSalary(e.target.value); handleChangeValidated("salary", e.target.value); }}
              onBlur={() => handleBlur("salary", salary)} required min="0" step="1"
              className={`w-full rounded-lg border ${touched.salary && fieldErrors.salary ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
            {touched.salary && fieldErrors.salary && (
              <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.salary}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Benefits Rate (%)</label>
            <input type="number" value={benefitsRate}
              onChange={(e) => { setBenefitsRate(e.target.value); handleChangeValidated("benefitsRate", e.target.value); }}
              onBlur={() => handleBlur("benefitsRate", benefitsRate)} min="0" max="100" step="1"
              className={`w-full rounded-lg border ${touched.benefitsRate && fieldErrors.benefitsRate ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
            {touched.benefitsRate && fieldErrors.benefitsRate && (
              <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.benefitsRate}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Start Date</label>
            <input type="date" value={startDate}
              onChange={(e) => { setStartDate(e.target.value); handleChangeValidated("startDate", e.target.value); }}
              onBlur={() => handleBlur("startDate", startDate)} required
              className={`w-full rounded-lg border ${touched.startDate && fieldErrors.startDate ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
            {touched.startDate && fieldErrors.startDate && (
              <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.startDate}</p>
            )}
          </div>
        </div>

        {salary && (
          <div className="rounded-lg bg-surface-50 border border-surface-200 px-4 py-3">
            <p className="text-xs text-surface-500">Monthly impact:</p>
            <p className="text-sm font-semibold text-surface-900">
              ${((Number(salary) * Number(count) * (1 + Number(benefitsRate) / 100)) / 12 / 1000).toFixed(1)}k/mo
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving || !title || !salary || Object.keys(fieldErrors).length > 0}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50">
            {saving ? "Saving..." : "Update Member"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
