"use client";

import { useState } from "react";
import { Input, Button } from "@/components/ui";
import { NumberInput } from "@/components/forms/primitives";
import { toUserMessage } from "@/lib/api-error";

/**
 * U3 (S4b Task 3) — controlled option-pool field body. Owns field state but
 * delegates persistence via `onSubmit`. No Modal / apiFetch / toast / router
 * here — the thin wrapper (option-pool-form) and the onboarding wizard supply
 * those. The single-pool guard lives in the API route. Cap-table is
 * currency-agnostic: reserved shares are integers.
 */

export interface OptionPoolValues {
  name: string;
  totalReserved: number;
}

export interface OptionPoolFormFieldsProps {
  initial?: Partial<OptionPoolValues>;
  onSubmit: (values: OptionPoolValues) => Promise<void>;
  onCancel: () => void;
}

export function OptionPoolFormFields({ initial, onSubmit, onCancel }: OptionPoolFormFieldsProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [totalReserved, setTotalReserved] = useState<number | null>(initial?.totalReserved ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSaving(true);
    try {
      await onSubmit({ name, totalReserved: totalReserved ?? 0 });
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <NumberInput
        label="Reserved shares"
        value={totalReserved}
        onChange={setTotalReserved}
        min={0}
        integerOnly
      />
      {error && (
        <div role="alert" className="rounded-lg border border-danger-500/20 bg-danger-50 px-3 py-2 text-xs text-danger-600">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={saving}
          data-testid="submit-option-pool"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
