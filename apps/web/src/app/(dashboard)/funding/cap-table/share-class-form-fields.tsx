"use client";

import { useState } from "react";
import { Input, Select, Button } from "@/components/ui";
import { NumberInput } from "@/components/forms/primitives";
import { toUserMessage } from "@/lib/api-error";

/**
 * U2 (S4b Task 3) — controlled share-class field body. Owns field state + the
 * issued>authorized validation, but delegates persistence via `onSubmit`. No
 * Modal / apiFetch / toast / router here — the thin wrapper (share-class-form)
 * and the onboarding wizard supply those. Cap-table is currency-agnostic.
 */

export interface ShareClassValues {
  name: string;
  classType: "common" | "preferred";
  totalAuthorized: number;
  totalIssued: number;
  liquidationPreference: number;
}

export interface ShareClassFormFieldsProps {
  initial?: Partial<ShareClassValues>;
  onSubmit: (values: ShareClassValues) => Promise<void>;
  onCancel: () => void;
}

export function ShareClassFormFields({ initial, onSubmit, onCancel }: ShareClassFormFieldsProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [classType, setClassType] = useState<ShareClassValues["classType"]>(
    initial?.classType ?? "preferred",
  );
  const [totalAuthorized, setTotalAuthorized] = useState<number | null>(
    initial?.totalAuthorized ?? null,
  );
  const [totalIssued, setTotalIssued] = useState<number | null>(initial?.totalIssued ?? 0);
  const [liquidationPreference, setLiquidationPreference] = useState<number | null>(
    initial?.liquidationPreference ?? 1,
  );
  const [issuedError, setIssuedError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    // Mirror the server refine (createShareClassSchema): block issued > authorized.
    if (totalAuthorized != null && totalIssued != null && totalIssued > totalAuthorized) {
      setIssuedError("Issued shares cannot exceed authorized shares.");
      return;
    }
    setIssuedError(null);
    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        name,
        classType,
        totalAuthorized: totalAuthorized ?? 0,
        totalIssued: totalIssued ?? 0,
        liquidationPreference: liquidationPreference ?? 1,
      });
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <Select
        label="Class type"
        value={classType}
        onChange={(e) => setClassType(e.target.value as ShareClassValues["classType"])}
      >
        <option value="common">Common</option>
        <option value="preferred">Preferred</option>
      </Select>
      <NumberInput
        label="Authorized shares"
        value={totalAuthorized}
        onChange={setTotalAuthorized}
        min={0}
        integerOnly
      />
      <NumberInput
        label="Issued shares"
        value={totalIssued}
        onChange={setTotalIssued}
        min={0}
        integerOnly
      />
      {issuedError && (
        <div role="alert" className="rounded-lg border border-danger-500/20 bg-danger-50 px-3 py-2 text-xs text-danger-600">
          {issuedError}
        </div>
      )}
      <NumberInput
        label="Liquidation preference"
        value={liquidationPreference}
        onChange={setLiquidationPreference}
        min={0}
        step={0.1}
        hint="Multiple (e.g., 1× non-participating)"
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
          data-testid="submit-share-class"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
