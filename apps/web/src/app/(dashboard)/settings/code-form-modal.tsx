"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui";
import type { CodeFormData } from "./invite-codes-types";

export function CodeFormModal({
  open,
  onClose,
  onSubmit,
  initial,
  mode,
  saving,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CodeFormData) => void;
  initial: CodeFormData;
  mode: "create" | "edit";
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<CodeFormData>(initial);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const set = <K extends keyof CodeFormData>(k: K, v: CodeFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "Create Invite Code" : "Edit Invite Code"}
      size="md"
    >
      <div className="space-y-4">
        {/* Code */}
        {mode === "create" && (
          <Input
            label="Code"
            type="text"
            value={form.code}
            onChange={(e) => set("code", e.target.value.toUpperCase())}
            placeholder="Auto-generated if left empty"
            className="font-mono"
          />
        )}

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            Type
          </label>
          <div className="flex gap-2">
            {(["single_use", "multi_use"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  set("type", t);
                  if (t === "single_use") set("maxRedemptions", 1);
                }}
                className={`flex-1 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                  form.type === t
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-surface-300 text-surface-600 hover:bg-surface-50"
                }`}
              >
                {t === "single_use" ? "Single Use" : "Multi Use"}
              </button>
            ))}
          </div>
        </div>

        {/* Max Redemptions (only for multi_use) */}
        {form.type === "multi_use" && (
          <Input
            label="Max Redemptions"
            type="number"
            min={1}
            max={10000}
            value={form.maxRedemptions}
            onChange={(e) => set("maxRedemptions", parseInt(e.target.value) || 1)}
          />
        )}

        {/* Expiry */}
        <Input
          label="Expiry Date"
          showOptional
          type="datetime-local"
          value={form.expiresAt}
          onChange={(e) => set("expiresAt", e.target.value)}
        />

        {/* Free Days + AI Credits — side by side */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Free Platform Days"
            type="number"
            min={0}
            max={365}
            value={form.freePlatformDays}
            onChange={(e) => set("freePlatformDays", parseInt(e.target.value) || 0)}
          />
          <Input
            label="AI Credits ($)"
            type="number"
            min={0}
            max={1000}
            value={form.aiCreditsCents / 100}
            onChange={(e) =>
              set("aiCreditsCents", Math.round((parseFloat(e.target.value) || 0) * 100))
            }
          />
        </div>

        {/* Note */}
        <Input
          label="Note"
          showOptional
          type="text"
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
          placeholder="e.g. YC batch, ProductHunt launch"
          maxLength={500}
        />

        {error && (
          <p className="text-sm text-danger-600 bg-danger-50 px-3 py-2 rounded-xl">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            state={saving ? "loading" : "idle"}
            onClick={() => onSubmit(form)}
          >
            {mode === "create" ? "Create Code" : "Save Changes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
