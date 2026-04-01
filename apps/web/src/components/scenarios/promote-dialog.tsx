"use client";

import { useState, useCallback } from "react";
import { ArrowUpCircle } from "lucide-react";
import { Modal, Button, FormField } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-fetch";
import { DataDiffView } from "./data-diff-view";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface PromoteDialogProps {
  open: boolean;
  onClose: () => void;
  scenarioId: string;
  scenarioName: string;
  onPromoted?: () => void;
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function PromoteDialog({
  open,
  onClose,
  scenarioId,
  scenarioName,
  onPromoted,
}: PromoteDialogProps) {
  const { success, error: toastError } = useToast();

  const [confirmText, setConfirmText] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfirmed = confirmText === scenarioName;

  const resetState = useCallback(() => {
    setConfirmText("");
    setPromoting(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handlePromote = useCallback(async () => {
    if (!isConfirmed) return;
    setPromoting(true);
    setError(null);

    try {
      const res = await apiFetch("/api/scenarios/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Promotion failed (${res.status})`);
      }

      const result = await res.json().catch(() => ({}));

      success("Scenario promoted to base", {
        description: result.backupId
          ? `A backup was created (${result.backupId.slice(0, 8)}). You can restore it from the scenario list.`
          : "All changes have been applied to your base plan.",
      });

      handleClose();
      onPromoted?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toastError("Promotion failed", { description: message });
      setPromoting(false);
    }
  }, [isConfirmed, scenarioId, success, toastError, handleClose, onPromoted]);

  return (
    <Modal open={open} onClose={handleClose} title="Promote Scenario to Base" size="xl">
      {/* Warning callout */}
      <div className="rounded-lg bg-warning-50 border border-warning-200 px-4 py-3 mb-5">
        <p className="text-sm text-warning-800">
          <strong>This action is irreversible.</strong> Promoting will overwrite your base plan with
          all changes from this scenario. A backup of the current base will be created automatically.
        </p>
      </div>

      {/* Part 1 — Diff Preview */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-surface-700 mb-3">Changes to apply</h3>
        <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-surface-200 p-3 bg-surface-25">
          <DataDiffView scenarioId={scenarioId} />
        </div>
      </div>

      {/* Part 2 — Confirmation */}
      <div className="mb-5">
        <FormField
          label={`Type "${scenarioName}" to confirm`}
          placeholder={scenarioName}
          value={confirmText}
          onChange={setConfirmText}
          hint="This ensures you intended to promote this specific scenario."
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3 text-sm text-danger-700" role="alert">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" onClick={handleClose} disabled={promoting}>
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={handlePromote}
          disabled={!isConfirmed}
          state={promoting ? "loading" : "idle"}
          icon={<ArrowUpCircle className="h-4 w-4" />}
        >
          Promote to Base
        </Button>
      </div>
    </Modal>
  );
}
