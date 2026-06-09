"use client";

/**
 * TEAM-01 · Wire the DepartmentTree orphan into /team.
 *
 * Mounts the existing <DepartmentTree> in a "Manage departments" modal and wires
 * its callbacks to the REST API:
 *   - onAddChild → POST   /api/departments          (name + parentId)
 *   - rename     → PATCH  /api/departments/[id]      (name)
 *   - delete     → DELETE /api/departments/[id]
 * then router.refresh() so the server-rendered tree + dropdowns re-read.
 *
 * SAFETY (delete): DELETE /api/departments/[id] in base mode hard-deletes the row,
 * and `headcountPlans.departmentId` is `onDelete: "cascade"` — so deleting a
 * department that still has roster rows silently destroys those headcount plans.
 * We therefore only expose the delete control for departments with ZERO headcount
 * references (`referencedDeptIds`); referenced departments show a disabled control
 * with an explanatory tooltip instead.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { Modal, Input, useConfirm } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { toUserMessage } from "@/lib/api-error";
import { Pencil, Trash2, Check, X } from "lucide-react";
import type { Department } from "@burnless/types";
import { DepartmentTree } from "./department-tree";

export interface ManageDepartmentsPanelProps {
  /** Flat department list (id, name, parentId) — provided by the server page. */
  departments: Array<Pick<Department, "id" | "name" | "parentId">>;
  /** Department ids that still have at least one headcount plan referencing them. */
  referencedDeptIds: Set<string>;
}

// DepartmentTree types `departments: Department[]`; we only ever read id/name/
// parentId/children, so widen the partial rows to satisfy the prop without
// fabricating companyId/timestamps.
function asTreeDepartments(
  rows: Array<Pick<Department, "id" | "name" | "parentId">>,
): Department[] {
  return rows as unknown as Department[];
}

export function ManageDepartmentsPanel({ departments, referencedDeptIds }: ManageDepartmentsPanelProps) {
  const router = useRouter();
  const toast = useToast();
  const { confirm: askConfirm, dialog } = useConfirm();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Inline "add" form state: which parent we are adding under (and at what level).
  const [adding, setAdding] = useState<{ parentId: string | null; level: 1 | 2 | 3 } | null>(null);
  const [addName, setAddName] = useState("");

  // Inline "rename" state: which department id is being renamed.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");

  function resetForms() {
    setAdding(null);
    setAddName("");
    setRenamingId(null);
    setRenameName("");
  }

  function handleClose() {
    setOpen(false);
    resetForms();
  }

  function handleAddChild(parentId: string | null, level: 1 | 2 | 3) {
    setRenamingId(null);
    setAdding({ parentId, level });
    setAddName("");
  }

  async function submitAdd() {
    if (!adding) return;
    const name = addName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: adding.parentId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(toUserMessage(body));
      }
      resetForms();
      router.refresh();
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function startRename(dept: { id: string; name: string }) {
    setAdding(null);
    setRenamingId(dept.id);
    setRenameName(dept.name);
  }

  async function submitRename() {
    if (!renamingId) return;
    const name = renameName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/departments/${renamingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(toUserMessage(body));
      }
      resetForms();
      router.refresh();
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(dept: { id: string; name: string }) {
    // Guarded by the disabled control, but defend the call path too.
    if (referencedDeptIds.has(dept.id)) return;
    const ok = await askConfirm({
      title: "Delete department?",
      body: `"${dept.name}" will be permanently removed. This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/departments/${dept.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(toUserMessage(body));
      }
      router.refresh();
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const deptById = new Map(departments.map((d) => [d.id, d]));

  return (
    <div data-testid="manage-departments">
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="open-manage-departments"
        className="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3 py-1.5 text-xs font-medium text-surface-700 hover:bg-surface-50 transition-colors"
      >
        Manage departments
      </button>

      <Modal open={open} onClose={handleClose} title="Manage departments" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-surface-500">
            Organize your team into a 3-level hierarchy. Departments with team members
            assigned cannot be deleted until those members are reassigned or removed.
          </p>

          <DepartmentTree
            departments={asTreeDepartments(departments)}
            onAddChild={handleAddChild}
          />

          {/* Inline add form */}
          {adding && (
            <div data-testid="add-department-form" className="rounded-lg border border-surface-200 p-3 space-y-2">
              <Input
                label={
                  adding.level === 1
                    ? "New organization name"
                    : adding.level === 2
                      ? "New sub-department name"
                      : "New team name"
                }
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                data-testid="add-department-name"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetForms}
                  className="rounded-lg border border-surface-300 px-3 py-1.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitAdd}
                  disabled={busy || !addName.trim()}
                  data-testid="submit-add-department"
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Add"}
                </button>
              </div>
            </div>
          )}

          {/* Rename / delete controls — one row per department */}
          {departments.length > 0 && (
            <div className="rounded-lg border border-surface-200 divide-y divide-surface-100">
              {departments.map((dept) => {
                const referenced = referencedDeptIds.has(dept.id);
                const isRenaming = renamingId === dept.id;
                return (
                  <div
                    key={dept.id}
                    data-testid={`manage-dept-row-${dept.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    {isRenaming ? (
                      <div className="flex flex-1 items-center gap-2">
                        <Input
                          label=""
                          value={renameName}
                          onChange={(e) => setRenameName(e.target.value)}
                          data-testid={`rename-input-${dept.id}`}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={submitRename}
                          disabled={busy || !renameName.trim()}
                          data-testid={`submit-rename-${dept.id}`}
                          className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                          title="Save name"
                          aria-label={`Save name for ${dept.name}`}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={resetForms}
                          className="rounded-md p-1.5 text-surface-400 hover:bg-surface-100"
                          title="Cancel rename"
                          aria-label="Cancel rename"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm text-surface-700">
                          {dept.name}
                          {dept.parentId && deptById.has(dept.parentId) && (
                            <span className="ml-2 text-xs text-surface-400">
                              in {deptById.get(dept.parentId)!.name}
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startRename(dept)}
                            data-testid={`rename-dept-${dept.id}`}
                            className="rounded-md p-1.5 text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                            title="Rename department"
                            aria-label={`Rename ${dept.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(dept)}
                            disabled={busy || referenced}
                            data-testid={`delete-dept-${dept.id}`}
                            className="rounded-md p-1.5 text-surface-400 hover:text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-40 disabled:hover:text-surface-400 disabled:hover:bg-transparent"
                            title={
                              referenced
                                ? "Has team members assigned — reassign or remove them first"
                                : "Delete department"
                            }
                            aria-label={`Delete ${dept.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
      {dialog}
    </div>
  );
}
