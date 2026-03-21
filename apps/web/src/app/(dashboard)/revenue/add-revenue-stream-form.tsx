"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import { Plus, Trash2 } from "lucide-react";
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

export interface EditRevenueStream {
  id: string;
  name: string;
  type: string;
  parameters: Record<string, unknown>;
}

interface AddRevenueStreamFormProps {
  scenarioId: string;
  editStream?: EditRevenueStream;
  open?: boolean;
  onClose?: () => void;
}

export function AddRevenueStreamForm({ scenarioId, editStream, open: controlledOpen, onClose }: AddRevenueStreamFormProps) {
  const router = useRouter();
  const isEditing = !!editStream;
  const isControlled = controlledOpen !== undefined;

  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [name, setName] = useState("");
  const [type, setType] = useState<string>("subscription");

  // Subscription params
  const [monthlyPrice, setMonthlyPrice] = useState("");
  const [startingCustomers, setStartingCustomers] = useState("");
  const [newCustomersPerMonth, setNewCustomersPerMonth] = useState("");
  const [monthlyChurnRate, setMonthlyChurnRate] = useState("");

  // Services params
  const [hourlyRate, setHourlyRate] = useState("");
  const [monthlyHours, setMonthlyHours] = useState("");

  // One-time params
  const [unitPrice, setUnitPrice] = useState("");
  const [monthlyUnits, setMonthlyUnits] = useState("");

  // Usage-based params
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [expectedUnits, setExpectedUnits] = useState("");

  // Pre-populate fields when editing
  useEffect(() => {
    if (editStream && open) {
      setName(editStream.name);
      setType(editStream.type);
      const p = editStream.parameters;

      // Reset all param fields first
      setMonthlyPrice("");
      setStartingCustomers("");
      setNewCustomersPerMonth("");
      setMonthlyChurnRate("");
      setHourlyRate("");
      setMonthlyHours("");
      setUnitPrice("");
      setMonthlyUnits("");
      setPricePerUnit("");
      setExpectedUnits("");

      switch (editStream.type) {
        case "subscription":
          setMonthlyPrice(String(p.monthlyPrice ?? ""));
          setStartingCustomers(String(p.startingCustomers ?? ""));
          setNewCustomersPerMonth(String(p.newCustomersPerMonth ?? ""));
          // Churn is stored as decimal (e.g. 0.025) but displayed as percentage (2.5)
          setMonthlyChurnRate(p.monthlyChurnRate != null ? String(Number(p.monthlyChurnRate) * 100) : "");
          break;
        case "services":
          setHourlyRate(String(p.hourlyRate ?? ""));
          setMonthlyHours(String(p.monthlyHours ?? ""));
          break;
        case "one_time":
          setUnitPrice(String(p.unitPrice ?? ""));
          setMonthlyUnits(String(p.monthlyUnits ?? ""));
          break;
        case "usage_based":
          setPricePerUnit(String(p.pricePerUnit ?? ""));
          setExpectedUnits(String(p.expectedUnits ?? ""));
          break;
      }

      setFieldErrors({});
      setTouched({});
      setError(null);
    }
  }, [editStream, open]);

  const PARAM_FIELDS: Record<string, string[]> = {
    subscription: ["monthlyPrice", "startingCustomers", "newCustomersPerMonth", "monthlyChurnRate"],
    services: ["hourlyRate", "monthlyHours"],
    one_time: ["unitPrice", "monthlyUnits"],
    usage_based: ["pricePerUnit", "expectedUnits"],
  };

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

  function handleTypeChange(newType: string) {
    // Clear errors for the old type's param fields
    const oldFields = PARAM_FIELDS[type] ?? [];
    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const f of oldFields) delete next[f];
      return next;
    });
    setTouched((prev) => {
      const next = { ...prev };
      for (const f of oldFields) delete next[f];
      return next;
    });
    setType(newType);
  }

  function inputBorderClass(field: string) {
    return touched[field] && fieldErrors[field] ? "border-danger-500" : "border-surface-300";
  }

  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

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
        return {
          hourlyRate: Number(hourlyRate),
          monthlyHours: Number(monthlyHours),
        };
      case "one_time":
        return {
          unitPrice: Number(unitPrice),
          monthlyUnits: Number(monthlyUnits),
        };
      case "usage_based":
        return {
          pricePerUnit: Number(pricePerUnit),
          expectedUnits: Number(expectedUnits),
        };
      default:
        return {};
    }
  }

  function resetForm() {
    setName("");
    setType("subscription");
    setMonthlyPrice("");
    setStartingCustomers("");
    setNewCustomersPerMonth("");
    setMonthlyChurnRate("");
    setHourlyRate("");
    setMonthlyHours("");
    setUnitPrice("");
    setMonthlyUnits("");
    setPricePerUnit("");
    setExpectedUnits("");
    setFieldErrors({});
    setTouched({});
    setError(null);
  }

  const handleClose = useCallback(() => {
    if (isControlled) {
      onClose?.();
    } else {
      setInternalOpen(false);
    }
    if (!isEditing) {
      resetForm();
    }
  }, [isControlled, onClose, isEditing]);

  async function handleDelete() {
    if (!editStream) return;
    if (!confirm("Are you sure you want to delete this revenue stream? This action cannot be undone.")) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/revenue-streams/${editStream.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete revenue stream");
      }

      handleClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate name + type
    const nameErrors = validateAll(revenueStreamFormSchema, { name, type });

    // Validate type-specific params
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
      // Mark all errored fields as touched so inline errors display
      setTouched((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(allErrors)) next[key] = true;
        return next;
      });
      return;
    }

    setSaving(true);

    try {
      const url = isEditing
        ? `/api/revenue-streams/${editStream.id}`
        : "/api/revenue-streams";

      const method = isEditing ? "PATCH" : "POST";

      const body = isEditing
        ? { name, type, parameters: buildParams() }
        : { scenarioId, name, type, parameters: buildParams() };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? (isEditing ? "Failed to update revenue stream" : "Failed to create revenue stream"));
      }

      handleClose();
      if (!isEditing) {
        resetForm();
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Only render the trigger button in add mode (uncontrolled) */}
      {!isControlled && (
        <button
          onClick={() => setInternalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Revenue Stream
        </button>
      )}

      <Modal open={open} onClose={handleClose} title={isEditing ? "Edit Revenue Stream" : "Add Revenue Stream"}>
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
              value={name}
              onChange={(e) => handleChangeWithValidation("name", e.target.value, setName, revenueStreamFormSchema)}
              onBlur={() => handleBlur("name", name, revenueStreamFormSchema)}
              placeholder="e.g. Growth Plan, Implementation Services"
              required
              className={`w-full rounded-lg border ${inputBorderClass("name")} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`}
            />
            {touched.name && fieldErrors.name && (
              <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {STREAM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="border-t border-surface-200 pt-4">
            <p className="text-xs font-medium text-surface-500 uppercase mb-3">
              {type === "subscription" ? "Subscription Parameters" :
               type === "services" ? "Services Parameters" :
               type === "one_time" ? "One-Time Parameters" :
               "Usage-Based Parameters"}
            </p>

            {type === "subscription" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Monthly Price ($)</label>
                  <input type="number" value={monthlyPrice}
                    onChange={(e) => handleChangeWithValidation("monthlyPrice", e.target.value, setMonthlyPrice, subscriptionParamsSchema)}
                    onBlur={() => handleBlur("monthlyPrice", monthlyPrice, subscriptionParamsSchema)}
                    placeholder="99" required min="0" step="0.01"
                    className={`w-full rounded-lg border ${inputBorderClass("monthlyPrice")} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
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
                      placeholder="50" required min="0"
                      className={`w-full rounded-lg border ${inputBorderClass("startingCustomers")} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                    {touched.startingCustomers && fieldErrors.startingCustomers && (
                      <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.startingCustomers}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1">New Customers/Mo</label>
                    <input type="number" value={newCustomersPerMonth}
                      onChange={(e) => handleChangeWithValidation("newCustomersPerMonth", e.target.value, setNewCustomersPerMonth, subscriptionParamsSchema)}
                      onBlur={() => handleBlur("newCustomersPerMonth", newCustomersPerMonth, subscriptionParamsSchema)}
                      placeholder="15" required min="0"
                      className={`w-full rounded-lg border ${inputBorderClass("newCustomersPerMonth")} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
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
                    placeholder="2.5" required min="0" max="100" step="0.1"
                    className={`w-full rounded-lg border ${inputBorderClass("monthlyChurnRate")} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
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
                    placeholder="150" required min="0" step="0.01"
                    className={`w-full rounded-lg border ${inputBorderClass("hourlyRate")} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                  {touched.hourlyRate && fieldErrors.hourlyRate && (
                    <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.hourlyRate}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Monthly Hours</label>
                  <input type="number" value={monthlyHours}
                    onChange={(e) => handleChangeWithValidation("monthlyHours", e.target.value, setMonthlyHours, servicesParamsSchema)}
                    onBlur={() => handleBlur("monthlyHours", monthlyHours, servicesParamsSchema)}
                    placeholder="40" required min="0"
                    className={`w-full rounded-lg border ${inputBorderClass("monthlyHours")} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
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
                    placeholder="500" required min="0" step="0.01"
                    className={`w-full rounded-lg border ${inputBorderClass("unitPrice")} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                  {touched.unitPrice && fieldErrors.unitPrice && (
                    <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.unitPrice}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Monthly Units</label>
                  <input type="number" value={monthlyUnits}
                    onChange={(e) => handleChangeWithValidation("monthlyUnits", e.target.value, setMonthlyUnits, oneTimeParamsSchema)}
                    onBlur={() => handleBlur("monthlyUnits", monthlyUnits, oneTimeParamsSchema)}
                    placeholder="10" required min="0"
                    className={`w-full rounded-lg border ${inputBorderClass("monthlyUnits")} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
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
                    placeholder="0.10" required min="0" step="0.001"
                    className={`w-full rounded-lg border ${inputBorderClass("pricePerUnit")} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                  {touched.pricePerUnit && fieldErrors.pricePerUnit && (
                    <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.pricePerUnit}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Expected Units/Mo</label>
                  <input type="number" value={expectedUnits}
                    onChange={(e) => handleChangeWithValidation("expectedUnits", e.target.value, setExpectedUnits, usageBasedParamsSchema)}
                    onBlur={() => handleBlur("expectedUnits", expectedUnits, usageBasedParamsSchema)}
                    placeholder="100000" required min="0"
                    className={`w-full rounded-lg border ${inputBorderClass("expectedUnits")} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                  {touched.expectedUnits && fieldErrors.expectedUnits && (
                    <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.expectedUnits}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            {isEditing ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-danger-300 px-3 py-2 text-sm font-medium text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? "Deleting..." : "Delete"}
              </button>
            ) : (
              <div />
            )}

            <div className="flex gap-3">
              <button type="button" onClick={handleClose}
                className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving || deleting || !name || hasFieldErrors}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50">
                {saving ? (isEditing ? "Saving..." : "Adding...") : (isEditing ? "Save Changes" : "Add Stream")}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
