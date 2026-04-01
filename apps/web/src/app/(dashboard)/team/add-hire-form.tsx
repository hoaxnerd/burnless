"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import { Plus, Trash2 } from "lucide-react";
import { validateField, validateAll, hireFormSchema } from "@/lib/form-validation";

interface Department {
  id: string;
  name: string;
}

export interface EditHire {
  id: string;
  departmentId: string;
  title: string;
  count: number;
  salary: string | number;
  startDate: string;
  endDate?: string | null;
  benefitsRate: string | number;
}

interface AddHireFormProps {
  scenarioId: string;
  departments: Department[];
  editHire?: EditHire;
  open?: boolean;
  onClose?: () => void;
}

function defaultStartDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function toDateInputValue(dateStr: string): string {
  // Handle ISO date strings by extracting YYYY-MM-DD
  return dateStr.slice(0, 10);
}

export function AddHireForm({ scenarioId, departments, editHire, open: controlledOpen, onClose }: AddHireFormProps) {
  const router = useRouter();
  const isEditMode = !!editHire;

  // Internal open state for add mode; edit mode is controlled externally
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [newDeptName, setNewDeptName] = useState("");
  const [count, setCount] = useState("1");
  const [salary, setSalary] = useState("");
  const [benefitsRate, setBenefitsRate] = useState("20");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState("");

  // Populate fields when editHire changes
  useEffect(() => {
    if (editHire) {
      setTitle(editHire.title);
      setDepartmentId(editHire.departmentId);
      setCount(String(editHire.count));
      setSalary(String(Number(editHire.salary)));
      setBenefitsRate(String(Math.round(Number(editHire.benefitsRate) * 100)));
      setStartDate(toDateInputValue(editHire.startDate));
      setEndDate(editHire.endDate ? toDateInputValue(editHire.endDate) : "");
      setNewDeptName("");
      setError(null);
      setFieldErrors({});
      setTouched({});
      setConfirmDelete(false);
    }
  }, [editHire]);

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      setInternalOpen(false);
    }
    setError(null);
    setFieldErrors({});
    setTouched({});
    setConfirmDelete(false);
    if (!isEditMode) {
      setTitle("");
      setCount("1");
      setSalary("");
      setBenefitsRate("20");
      setNewDeptName("");
      setEndDate("");
      setStartDate(defaultStartDate());
    }
  }, [onClose, isEditMode]);

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

  async function handleDelete() {
    if (!editHire) return;

    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const res = await apiFetch(`/api/headcount/${editHire.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete team member");
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
      // Create department if needed
      let deptId = departmentId;
      if (deptId === "__new__" && newDeptName.trim()) {
        const deptRes = await apiFetch("/api/departments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newDeptName.trim() }),
        });
        if (!deptRes.ok) throw new Error("Failed to create department");
        const dept = await deptRes.json();
        deptId = dept.id;
      }

      if (!deptId || deptId === "__new__") {
        throw new Error("Please select or create a department");
      }

      if (isEditMode) {
        // PATCH existing hire
        const res = await apiFetch(`/api/headcount/${editHire.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            departmentId: deptId,
            title,
            count: Number(count),
            salary: Number(salary),
            startDate,
            endDate: endDate || null,
            benefitsRate: Number(benefitsRate) / 100,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to update team member");
        }
      } else {
        // POST new hire
        const res = await apiFetch("/api/headcount", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenarioId,
            departmentId: deptId,
            title,
            count: Number(count),
            salary: Number(salary),
            startDate,
            benefitsRate: Number(benefitsRate) / 100,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to add team member");
        }
      }

      handleClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Only show the add button in add mode */}
      {!isEditMode && (
        <button
          onClick={() => setInternalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Team Member
        </button>
      )}

      <Modal
        open={open}
        onClose={handleClose}
        title={isEditMode ? "Edit Team Member" : "Add Team Member / Planned Hire"}
      >
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
              onBlur={() => handleBlur("title", title)}
              placeholder="e.g. Senior Engineer, Product Manager" required
              className={`w-full rounded-lg border ${touched.title && fieldErrors.title ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
            {touched.title && fieldErrors.title && (
              <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.title}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Department</label>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500">
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
              <option value="__new__">+ Create new department</option>
            </select>
          </div>

          {departmentId === "__new__" && (
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">New Department Name</label>
              <input type="text" value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="e.g. Engineering, Sales" required
                className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Count</label>
              <input type="number" value={count}
                onChange={(e) => { setCount(e.target.value); handleChangeValidated("count", e.target.value); }}
                onBlur={() => handleBlur("count", count)}
                required min="1" step="1"
                className={`w-full rounded-lg border ${touched.count && fieldErrors.count ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
              {touched.count && fieldErrors.count && (
                <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.count}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Annual Salary ($)</label>
              <input type="number" value={salary}
                onChange={(e) => { setSalary(e.target.value); handleChangeValidated("salary", e.target.value); }}
                onBlur={() => handleBlur("salary", salary)}
                placeholder="120000" required min="0" step="1"
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
                onBlur={() => handleBlur("benefitsRate", benefitsRate)}
                placeholder="20" min="0" max="100" step="1"
                className={`w-full rounded-lg border ${touched.benefitsRate && fieldErrors.benefitsRate ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
              {touched.benefitsRate && fieldErrors.benefitsRate && (
                <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.benefitsRate}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Start Date</label>
              <input type="date" value={startDate}
                onChange={(e) => { setStartDate(e.target.value); handleChangeValidated("startDate", e.target.value); }}
                onBlur={() => handleBlur("startDate", startDate)}
                required
                className={`w-full rounded-lg border ${touched.startDate && fieldErrors.startDate ? "border-danger-500" : "border-surface-300"} px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500`} />
              {touched.startDate && fieldErrors.startDate && (
                <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">{fieldErrors.startDate}</p>
              )}
            </div>
          </div>

          {isEditMode && (
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">End Date (optional)</label>
              <input type="date" value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <p className="mt-1 text-xs text-surface-400">Leave empty for ongoing positions</p>
            </div>
          )}

          {salary && (
            <div className="rounded-lg bg-surface-50 border border-surface-200 px-4 py-3">
              <p className="text-xs text-surface-500">Monthly impact:</p>
              <p className="text-sm font-semibold text-surface-900">
                +${((Number(salary) * Number(count) * (1 + Number(benefitsRate) / 100)) / 12 / 1000).toFixed(1)}k/mo
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {/* Delete button - only in edit mode */}
            <div>
              {isEditMode && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting || saving}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                    confirmDelete
                      ? "bg-danger-600 text-white hover:bg-danger-700"
                      : "text-danger-600 hover:bg-danger-50 border border-danger-200"
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleting ? "Deleting..." : confirmDelete ? "Confirm Delete" : "Delete"}
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={handleClose}
                className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving || deleting || !title || !salary || Object.keys(fieldErrors).length > 0}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50">
                {saving ? (isEditMode ? "Saving..." : "Adding...") : (isEditMode ? "Save Changes" : "Add Member")}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
