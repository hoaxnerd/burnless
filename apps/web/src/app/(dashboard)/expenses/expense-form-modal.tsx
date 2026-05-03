"use client";

/**
 * Modal wrapper around the consolidated <ExpenseForm>. Handles:
 *
 * - Add mode: a "+ Add Expense" trigger button + Modal hosting the form.
 * - Edit mode: a controlled `open`/`onClose` Modal hosting the form.
 *
 * Submission goes straight to `/api/forecast-lines` (POST for add) or
 * `/api/forecast-lines/[id]` (PATCH for edit) via `apiFetch`, then triggers
 * `router.refresh()` to re-fetch server data.
 *
 * Phase 1 §1.7 / §2.C — replaces the legacy `add-expense-form.tsx` and
 * `edit-expense-form.tsx` (deleted in Task 15).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui";
import { apiFetch } from "@/lib/api-fetch";
import { ExpenseForm, type ExpenseRow, type ExpenseSubmitPayload } from "./expense-form";

interface CommonProps {
  accounts: Array<{ id: string; name: string }>;
  departments?: Array<{ id: string; name: string }>;
  forecastLines?: Array<{ id: string; name: string }>;
}

interface AddProps extends CommonProps {
  mode: "add";
}

interface EditProps extends CommonProps {
  mode: "edit";
  initialValue: ExpenseRow;
  open: boolean;
  onClose: () => void;
}

export type ExpenseFormModalProps = AddProps | EditProps;

export function ExpenseFormModal(props: ExpenseFormModalProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);

  const isAdd = props.mode === "add";
  const open = isAdd ? internalOpen : props.open;
  const close = isAdd ? () => setInternalOpen(false) : props.onClose;

  async function handleSubmit(payload: ExpenseSubmitPayload) {
    if (isAdd) {
      const res = await apiFetch("/api/forecast-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create expense");
      }
    } else {
      const id = props.initialValue.id;
      const res = await apiFetch(`/api/forecast-lines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update expense");
      }
    }
    close();
    router.refresh();
  }

  return (
    <>
      {isAdd && (
        <button
          onClick={() => setInternalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Expense
        </button>
      )}
      <Modal open={open} onClose={close} title={isAdd ? "Add Expense" : "Edit Expense"}>
        {isAdd ? (
          <ExpenseForm
            mode="add"
            accounts={props.accounts}
            departments={props.departments}
            forecastLines={props.forecastLines}
            onSubmit={handleSubmit}
            onCancel={close}
          />
        ) : (
          <ExpenseForm
            mode="edit"
            initialValue={props.initialValue}
            accounts={props.accounts}
            departments={props.departments}
            forecastLines={props.forecastLines}
            onSubmit={handleSubmit}
            onCancel={close}
          />
        )}
      </Modal>
    </>
  );
}
