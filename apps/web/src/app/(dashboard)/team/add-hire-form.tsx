"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import { Plus } from "lucide-react";
import { validateField, validateAll, hireFormSchema } from "@/lib/form-validation";

interface Department {
  id: string;
  name: string;
}

interface AddHireFormProps {
  scenarioId: string;
  departments: Department[];
}

export function AddHireForm({ scenarioId, departments }: AddHireFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [newDeptName, setNewDeptName] = useState("");
  const [count, setCount] = useState("1");
  const [salary, setSalary] = useState("");
  const [benefitsRate, setBenefitsRate] = useState("20");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });

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
      // Create department if needed
      let deptId = departmentId;
      if (deptId === "__new__" && newDeptName.trim()) {
        const deptRes = await fetch("/api/departments", {
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

      const res = await fetch("/api/headcount", {
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

      setTitle("");
      setCount("1");
      setSalary("");
      setBenefitsRate("20");
      setNewDeptName("");
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
        Add Team Member
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Team Member / Planned Hire">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
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

          {salary && (
            <div className="rounded-lg bg-surface-50 border border-surface-200 px-4 py-3">
              <p className="text-xs text-surface-500">Monthly impact:</p>
              <p className="text-sm font-semibold text-surface-900">
                +${((Number(salary) * Number(count) * (1 + Number(benefitsRate) / 100)) / 12 / 1000).toFixed(1)}k/mo
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)}
              className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !title || !salary || Object.keys(fieldErrors).length > 0}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50">
              {saving ? "Adding..." : "Add Member"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
