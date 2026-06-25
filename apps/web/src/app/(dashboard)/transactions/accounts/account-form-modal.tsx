"use client";

/**
 * Add/edit modal for a chart-of-accounts entry. Submits to POST /api/accounts
 * (add) or PATCH /api/accounts/[id] (edit) via apiFetch, then router.refresh().
 * Mirrors transaction-form-modal's discriminated-union add/edit shape. `isSystem`
 * is NOT a form field — it's not patchable (updateAccountSchema omits it) and new
 * accounts default to non-system.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal, Input, Select, Button } from "@/components/ui";
import { apiFetch } from "@/lib/api-fetch";
import { toUserMessage } from "@/lib/api-error";

export interface AccountFormRow {
  id: string;
  name: string;
  type: string;
  category: string;
  coversHeadcount: boolean;
}

const TYPES = ["income", "expense", "asset", "liability", "equity"] as const;
const CATEGORIES = [
  "revenue", "cogs", "operating_expense", "other_income",
  "other_expense", "asset", "liability", "equity",
] as const;

type AddProps = { mode: "add" };
type EditProps = { mode: "edit"; initialValue: AccountFormRow; open: boolean; onClose: () => void };
export type AccountFormModalProps = AddProps | EditProps;

export function AccountFormModal(props: AccountFormModalProps) {
  const router = useRouter();
  const isAdd = props.mode === "add";

  const [internalOpen, setInternalOpen] = useState(false);
  const open = isAdd ? internalOpen : props.open;
  const close = isAdd ? () => setInternalOpen(false) : props.onClose;

  const init = isAdd ? null : props.initialValue;
  const [name, setName] = useState<string>(init?.name ?? "");
  const [type, setType] = useState<string>(init?.type ?? "expense");
  const [category, setCategory] = useState<string>(init?.category ?? "operating_expense");
  const [coversHeadcount, setCoversHeadcount] = useState<boolean>(init?.coversHeadcount ?? false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isValid = name.trim() !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValid) {
      setError("An account name is required.");
      return;
    }
    const payload = { name: name.trim(), type, category, coversHeadcount };
    setSubmitting(true);
    try {
      const res = isAdd
        ? await apiFetch("/api/accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch(`/api/accounts/${(props as EditProps).initialValue.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to ${isAdd ? "create" : "update"} account`);
      }
      close();
      router.refresh();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {isAdd && (
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setInternalOpen(true)}>
          Add Account
        </Button>
      )}
      <Modal open={open} onClose={close} title={isAdd ? "Add Account" : "Edit Account"}>
        <form onSubmit={handleSubmit} className="space-y-4" aria-label={isAdd ? "Add account" : "Edit account"}>
          {error && (
            <div className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600" role="alert">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="acc-name" className="block text-sm font-medium text-surface-700 mb-1">Name</label>
            <Input id="acc-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marketing Expenses" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="acc-type" className="block text-sm font-medium text-surface-700 mb-1">Type</label>
              <Select id="acc-type" value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="acc-category" className="block text-sm font-medium text-surface-700 mb-1">Category</label>
              <Select id="acc-category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="acc-covers-headcount"
              type="checkbox"
              checked={coversHeadcount}
              onChange={(e) => setCoversHeadcount(e.target.checked)}
              className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="acc-covers-headcount" className="text-sm text-surface-700">
              Covers headcount <span className="text-surface-400">(this account&apos;s costs are personnel the headcount plan also models)</span>
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={close} disabled={submitting}>Cancel</Button>
            <Button type="submit" state={submitting ? "loading" : "idle"} disabled={!isValid}>
              {isAdd ? "Add Account" : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
