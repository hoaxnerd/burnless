"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import { Plus, Trash2 } from "lucide-react";
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

export interface EditRound {
  id: string;
  name: string;
  type: string;
  amount: string | number;
  date: string;
  preMoneyValuation?: string | number | null;
  dilutionPercent?: string | number | null;
  isProjected: boolean;
}

interface AddFundingFormProps {
  editRound?: EditRound;
  open?: boolean;
  onClose?: () => void;
}

export function AddFundingForm({ editRound, open: controlledOpen, onClose }: AddFundingFormProps) {
  const router = useRouter();
  const isEditing = !!editRound;
  const isControlled = controlledOpen !== undefined;

  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [name, setName] = useState("");
  const [type, setType] = useState<string>("seed");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [preMoneyValuation, setPreMoneyValuation] = useState("");
  const [dilutionPercent, setDilutionPercent] = useState("");
  const [isProjected, setIsProjected] = useState(false);

  // Pre-populate fields when editing
  useEffect(() => {
    if (editRound && open) {
      setName(editRound.name);
      setType(editRound.type);
      setAmount(String(editRound.amount));
      // Parse ISO date string to YYYY-MM-DD format
      const dateStr = editRound.date;
      if (dateStr.includes("T")) {
        setDate(dateStr.split("T")[0]!);
      } else {
        setDate(dateStr);
      }
      setPreMoneyValuation(editRound.preMoneyValuation != null ? String(editRound.preMoneyValuation) : "");
      setDilutionPercent(editRound.dilutionPercent != null ? String(editRound.dilutionPercent) : "");
      setIsProjected(editRound.isProjected);
      setFieldErrors({});
      setTouched({});
      setError(null);
      setConfirmDelete(false);
    }
  }, [editRound, open]);

  function handleOpen() {
    if (isControlled) return;
    setInternalOpen(true);
  }

  function handleClose() {
    if (isControlled && onClose) {
      onClose();
    } else {
      setInternalOpen(false);
    }
    setConfirmDelete(false);
    setError(null);
    if (!isEditing) {
      resetForm();
    }
  }

  function resetForm() {
    setName("");
    setType("seed");
    setAmount("");
    const d = new Date();
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
    setPreMoneyValuation("");
    setDilutionPercent("");
    setIsProjected(false);
    setFieldErrors({});
    setTouched({});
  }

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

    const errors = validateAll(fundingFormSchema, {
      name,
      amount,
      date,
      preMoneyValuation,
      dilutionPercent,
    });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setTouched({
        name: true,
        amount: true,
        date: true,
        preMoneyValuation: true,
        dilutionPercent: true,
      });
      return;
    }

    setSaving(true);

    try {
      const body = {
        name,
        type,
        amount: Number(amount),
        date,
        preMoneyValuation: preMoneyValuation ? Number(preMoneyValuation) : null,
        dilutionPercent: dilutionPercent ? Number(dilutionPercent) : null,
        isProjected,
      };

      const url = isEditing
        ? `/api/funding-rounds/${editRound.id}`
        : "/api/funding-rounds";

      const res = await apiFetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to ${isEditing ? "update" : "add"} funding round`);
      }

      handleClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editRound) return;

    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const res = await apiFetch(`/api/funding-rounds/${editRound.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete funding round");
      }

      handleClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      {/* Only show the trigger button when not in controlled (edit) mode */}
      {!isControlled && (
        <button
          onClick={handleOpen}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Funding Round
        </button>
      )}

      <Modal open={open} onClose={handleClose} title={isEditing ? "Edit Funding Round" : "Add Funding Round"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Round Name</label>
            <input type="text" value={name} onChange={(e) => { setName(e.target.value); handleChangeWithValidation("name", e.target.value); }}
              onBlur={() => handleBlur("name", name)}
              placeholder="e.g. Seed Round, AWS Activate Grant" required
              className={`w-full rounded-lg border ${touched.name && fieldErrors.name ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
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
              onBlur={() => handleBlur("amount", amount)}
              placeholder="2000000" required min="0" step="1"
              className={`w-full rounded-lg border ${touched.amount && fieldErrors.amount ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
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
                  onBlur={() => handleBlur("preMoneyValuation", preMoneyValuation)}
                  placeholder="8000000" min="0" step="1"
                  className={`w-full rounded-lg border ${touched.preMoneyValuation && fieldErrors.preMoneyValuation ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                {touched.preMoneyValuation && fieldErrors.preMoneyValuation && (
                  <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.preMoneyValuation}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">
                  Dilution (%) <span className="text-surface-400 font-normal">(optional)</span>
                </label>
                <input type="number" value={dilutionPercent} onChange={(e) => { setDilutionPercent(e.target.value); handleChangeWithValidation("dilutionPercent", e.target.value); }}
                  onBlur={() => handleBlur("dilutionPercent", dilutionPercent)}
                  placeholder="20" min="0" max="100" step="0.01"
                  className={`w-full rounded-lg border ${touched.dilutionPercent && fieldErrors.dilutionPercent ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
                {touched.dilutionPercent && fieldErrors.dilutionPercent && (
                  <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.dilutionPercent}</p>
                )}
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <input type="checkbox" id={isEditing ? "isProjectedEdit" : "isProjected"} checked={isProjected}
              onChange={(e) => setIsProjected(e.target.checked)}
              className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
            <label htmlFor={isEditing ? "isProjectedEdit" : "isProjected"} className="text-sm text-surface-700">
              This is a projected/planned round (not yet closed)
            </label>
          </div>

          <div className="flex items-center justify-between pt-2">
            {/* Delete button (only in edit mode) */}
            {isEditing ? (
              <div>
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-danger-600">Are you sure?</span>
                    <button type="button" onClick={handleDelete} disabled={deleting}
                      className="rounded-lg bg-danger-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-danger-700 transition-colors disabled:opacity-50">
                      {deleting ? "Deleting..." : "Yes, delete"}
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting}
                      className="rounded-lg border border-surface-300 px-3 py-1.5 text-xs font-medium text-surface-700 hover:bg-surface-50 transition-colors">
                      No
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={handleDelete}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-danger-200 px-3 py-1.5 text-xs font-medium text-danger-600 hover:bg-danger-50 transition-colors">
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                )}
              </div>
            ) : (
              <div />
            )}

            <div className="flex gap-3">
              <button type="button" onClick={handleClose}
                className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving || !name || !amount || Object.keys(fieldErrors).length > 0}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50">
                {saving ? (isEditing ? "Saving..." : "Adding...") : (isEditing ? "Save Changes" : "Add Round")}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
