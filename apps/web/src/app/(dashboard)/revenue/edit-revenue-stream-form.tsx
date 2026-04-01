"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import { z } from "zod";
import {
  validateField,
  validateAll,
  revenueStreamFormSchema,
  subscriptionParamsSchema,
  servicesParamsSchema,
  oneTimeParamsSchema,
  usageBasedParamsSchema,
} from "@/lib/form-validation";

const STREAM_TYPES = [
  { value: "subscription", label: "Subscription (SaaS)" },
  { value: "services", label: "Professional Services" },
  { value: "one_time", label: "One-Time Sales" },
  { value: "usage_based", label: "Usage-Based" },
] as const;

export interface EditRevenueStreamData {
  id: string;
  name: string;
  type: string;
  parameters: Record<string, unknown>;
}

interface EditRevenueStreamFormProps {
  stream: EditRevenueStreamData;
  open: boolean;
  onClose: () => void;
}

export function EditRevenueStreamForm({ stream, open, onClose }: EditRevenueStreamFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [name, setName] = useState(stream.name);
  const [type, setType] = useState(stream.type);

  // Subscription params
  const [monthlyPrice, setMonthlyPrice] = useState(String(stream.parameters.monthlyPrice ?? ""));
  const [startingCustomers, setStartingCustomers] = useState(String(stream.parameters.startingCustomers ?? ""));
  const [newCustomersPerMonth, setNewCustomersPerMonth] = useState(String(stream.parameters.newCustomersPerMonth ?? ""));
  const [monthlyChurnRate, setMonthlyChurnRate] = useState(
    stream.parameters.monthlyChurnRate != null ? String(Number(stream.parameters.monthlyChurnRate) * 100) : ""
  );

  // Services params
  const [hourlyRate, setHourlyRate] = useState(String(stream.parameters.hourlyRate ?? ""));
  const [monthlyHours, setMonthlyHours] = useState(String(stream.parameters.monthlyHours ?? ""));

  // One-time params
  const [unitPrice, setUnitPrice] = useState(String(stream.parameters.unitPrice ?? ""));
  const [monthlyUnits, setMonthlyUnits] = useState(String(stream.parameters.monthlyUnits ?? ""));

  // Usage-based params
  const [pricePerUnit, setPricePerUnit] = useState(String(stream.parameters.pricePerUnit ?? ""));
  const [expectedUnits, setExpectedUnits] = useState(String(stream.parameters.expectedUnits ?? ""));

  function getParamsSchema(streamType: string): z.AnyZodObject {
    switch (streamType) {
      case "subscription": return subscriptionParamsSchema;
      case "services": return servicesParamsSchema;
      case "one_time": return oneTimeParamsSchema;
      case "usage_based": return usageBasedParamsSchema;
      default: return subscriptionParamsSchema;
    }
  }

  function handleBlur(field: string, value: string, schema: Parameters<typeof validateField>[0]) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const err = validateField(schema, field, value);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (err) next[field] = err;
      else delete next[field];
      return next;
    });
  }

  function handleChangeWithValidation(field: string, value: string, setter: (v: string) => void, schema: Parameters<typeof validateField>[0]) {
    setter(value);
    if (touched[field]) {
      const err = validateField(schema, field, value);
      setFieldErrors((prev) => {
        const next = { ...prev };
        if (err) next[field] = err;
        else delete next[field];
        return next;
      });
    }
  }

  function inputBorderClass(field: string) {
    return touched[field] && fieldErrors[field] ? "border-danger-500" : "border-surface-300";
  }

  function buildParams(): Record<string, unknown> {
    switch (type) {
      case "subscription":
        return {
          monthlyPrice: Number(monthlyPrice),
          startingCustomers: Number(startingCustomers),
          newCustomersPerMonth: Number(newCustomersPerMonth),
          monthlyChurnRate: Number(monthlyChurnRate) / 100,
        };
      case "services":
        return { hourlyRate: Number(hourlyRate), monthlyHours: Number(monthlyHours) };
      case "one_time":
        return { unitPrice: Number(unitPrice), monthlyUnits: Number(monthlyUnits) };
      case "usage_based":
        return { pricePerUnit: Number(pricePerUnit), expectedUnits: Number(expectedUnits) };
      default:
        return {};
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const nameErrors = validateAll(revenueStreamFormSchema, { name, type });
    const paramsSchema = getParamsSchema(type);
    let paramsValues: Record<string, string> = {};
    switch (type) {
      case "subscription":
        paramsValues = { monthlyPrice, startingCustomers, newCustomersPerMonth, monthlyChurnRate };
        break;
      case "services":
        paramsValues = { hourlyRate, monthlyHours };
        break;
      case "one_time":
        paramsValues = { unitPrice, monthlyUnits };
        break;
      case "usage_based":
        paramsValues = { pricePerUnit, expectedUnits };
        break;
    }
    const paramErrors = validateAll(paramsSchema, paramsValues);
    const allErrors = { ...nameErrors, ...paramErrors };

    if (Object.keys(allErrors).length > 0) {
      setFieldErrors(allErrors);
      setTouched((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(allErrors)) next[key] = true;
        return next;
      });
      return;
    }

    setSaving(true);

    try {
      const res = await apiFetch(`/api/revenue-streams/${stream.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, parameters: buildParams() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update revenue stream");
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
    <Modal open={open} onClose={onClose} title={`Edit: ${stream.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Name</label>
          <input
            type="text" value={name}
            onChange={(e) => handleChangeWithValidation("name", e.target.value, setName, revenueStreamFormSchema)}
            onBlur={() => handleBlur("name", name, revenueStreamFormSchema)}
            required
            className={`w-full rounded-lg border ${inputBorderClass("name")} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`}
          />
          {touched.name && fieldErrors.name && (
            <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.name}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500">
            {STREAM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="border-t border-surface-200 pt-4">
          <p className="text-xs font-medium text-surface-500 uppercase mb-3">Parameters</p>

          {type === "subscription" && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Monthly Price ($)</label>
                <input type="number" value={monthlyPrice}
                  onChange={(e) => handleChangeWithValidation("monthlyPrice", e.target.value, setMonthlyPrice, subscriptionParamsSchema)}
                  onBlur={() => handleBlur("monthlyPrice", monthlyPrice, subscriptionParamsSchema)}
                  required min="0" step="0.01"
                  className={`w-full rounded-lg border ${inputBorderClass("monthlyPrice")} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                {touched.monthlyPrice && fieldErrors.monthlyPrice && (
                  <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.monthlyPrice}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Starting Customers</label>
                  <input type="number" value={startingCustomers}
                    onChange={(e) => handleChangeWithValidation("startingCustomers", e.target.value, setStartingCustomers, subscriptionParamsSchema)}
                    onBlur={() => handleBlur("startingCustomers", startingCustomers, subscriptionParamsSchema)}
                    required min="0"
                    className={`w-full rounded-lg border ${inputBorderClass("startingCustomers")} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                  {touched.startingCustomers && fieldErrors.startingCustomers && (
                    <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.startingCustomers}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">New Customers/Mo</label>
                  <input type="number" value={newCustomersPerMonth}
                    onChange={(e) => handleChangeWithValidation("newCustomersPerMonth", e.target.value, setNewCustomersPerMonth, subscriptionParamsSchema)}
                    onBlur={() => handleBlur("newCustomersPerMonth", newCustomersPerMonth, subscriptionParamsSchema)}
                    required min="0"
                    className={`w-full rounded-lg border ${inputBorderClass("newCustomersPerMonth")} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                  {touched.newCustomersPerMonth && fieldErrors.newCustomersPerMonth && (
                    <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.newCustomersPerMonth}</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Monthly Churn Rate (%)</label>
                <input type="number" value={monthlyChurnRate}
                  onChange={(e) => handleChangeWithValidation("monthlyChurnRate", e.target.value, setMonthlyChurnRate, subscriptionParamsSchema)}
                  onBlur={() => handleBlur("monthlyChurnRate", monthlyChurnRate, subscriptionParamsSchema)}
                  required min="0" max="100" step="0.1"
                  className={`w-full rounded-lg border ${inputBorderClass("monthlyChurnRate")} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                {touched.monthlyChurnRate && fieldErrors.monthlyChurnRate && (
                  <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.monthlyChurnRate}</p>
                )}
              </div>
            </div>
          )}

          {type === "services" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Hourly Rate ($)</label>
                <input type="number" value={hourlyRate}
                  onChange={(e) => handleChangeWithValidation("hourlyRate", e.target.value, setHourlyRate, servicesParamsSchema)}
                  onBlur={() => handleBlur("hourlyRate", hourlyRate, servicesParamsSchema)}
                  required min="0" step="0.01"
                  className={`w-full rounded-lg border ${inputBorderClass("hourlyRate")} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                {touched.hourlyRate && fieldErrors.hourlyRate && (
                  <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.hourlyRate}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Monthly Hours</label>
                <input type="number" value={monthlyHours}
                  onChange={(e) => handleChangeWithValidation("monthlyHours", e.target.value, setMonthlyHours, servicesParamsSchema)}
                  onBlur={() => handleBlur("monthlyHours", monthlyHours, servicesParamsSchema)}
                  required min="0"
                  className={`w-full rounded-lg border ${inputBorderClass("monthlyHours")} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                {touched.monthlyHours && fieldErrors.monthlyHours && (
                  <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.monthlyHours}</p>
                )}
              </div>
            </div>
          )}

          {type === "one_time" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Unit Price ($)</label>
                <input type="number" value={unitPrice}
                  onChange={(e) => handleChangeWithValidation("unitPrice", e.target.value, setUnitPrice, oneTimeParamsSchema)}
                  onBlur={() => handleBlur("unitPrice", unitPrice, oneTimeParamsSchema)}
                  required min="0" step="0.01"
                  className={`w-full rounded-lg border ${inputBorderClass("unitPrice")} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                {touched.unitPrice && fieldErrors.unitPrice && (
                  <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.unitPrice}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Monthly Units</label>
                <input type="number" value={monthlyUnits}
                  onChange={(e) => handleChangeWithValidation("monthlyUnits", e.target.value, setMonthlyUnits, oneTimeParamsSchema)}
                  onBlur={() => handleBlur("monthlyUnits", monthlyUnits, oneTimeParamsSchema)}
                  required min="0"
                  className={`w-full rounded-lg border ${inputBorderClass("monthlyUnits")} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                {touched.monthlyUnits && fieldErrors.monthlyUnits && (
                  <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.monthlyUnits}</p>
                )}
              </div>
            </div>
          )}

          {type === "usage_based" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Price per Unit ($)</label>
                <input type="number" value={pricePerUnit}
                  onChange={(e) => handleChangeWithValidation("pricePerUnit", e.target.value, setPricePerUnit, usageBasedParamsSchema)}
                  onBlur={() => handleBlur("pricePerUnit", pricePerUnit, usageBasedParamsSchema)}
                  required min="0" step="0.001"
                  className={`w-full rounded-lg border ${inputBorderClass("pricePerUnit")} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                {touched.pricePerUnit && fieldErrors.pricePerUnit && (
                  <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.pricePerUnit}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Expected Units/Mo</label>
                <input type="number" value={expectedUnits}
                  onChange={(e) => handleChangeWithValidation("expectedUnits", e.target.value, setExpectedUnits, usageBasedParamsSchema)}
                  onBlur={() => handleBlur("expectedUnits", expectedUnits, usageBasedParamsSchema)}
                  required min="0"
                  className={`w-full rounded-lg border ${inputBorderClass("expectedUnits")} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                {touched.expectedUnits && fieldErrors.expectedUnits && (
                  <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.expectedUnits}</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving || !name || Object.keys(fieldErrors).length > 0}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50">
            {saving ? "Saving..." : "Update Stream"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
