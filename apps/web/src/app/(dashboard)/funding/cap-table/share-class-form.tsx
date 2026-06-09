"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { Modal, Input, Select, Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { NumberInput } from "@/components/forms/primitives";
import { toUserMessage } from "@/lib/api-error";
import type { ShareClassRow } from "./cap-table-view";

/**
 * U2 — share-class add/edit form. Cap-table structure is base-data-only
 * (Phase 3 F §F5); the API route owns scenario safety (409 if a scenario is
 * active). apiFetch is the SOLE X-Scenario-Id injector — never set manually.
 * Cap-table is currency-agnostic: share counts are integers; liquidation
 * preference is a plain multiple. No currency formatting here.
 */

type ClassType = "common" | "preferred";

interface Props {
  /** Pass to edit an existing class; omit to add a new one. */
  existing?: ShareClassRow;
}

export function ShareClassForm({ existing }: Props) {
  const router = useRouter();
  const toast = useToast();
  const isEdit = existing != null;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(existing?.name ?? "");
  const [classType, setClassType] = useState<ClassType>(existing?.classType ?? "preferred");
  const [totalAuthorized, setTotalAuthorized] = useState<number | null>(
    existing ? Number(existing.totalAuthorized) : null,
  );
  const [totalIssued, setTotalIssued] = useState<number | null>(
    existing ? Number(existing.totalIssued) : 0,
  );
  const [liquidationPreference, setLiquidationPreference] = useState<number | null>(1);
  const [issuedError, setIssuedError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName(existing?.name ?? "");
    setClassType(existing?.classType ?? "preferred");
    setTotalAuthorized(existing ? Number(existing.totalAuthorized) : null);
    setTotalIssued(existing ? Number(existing.totalIssued) : 0);
    setLiquidationPreference(1);
    setIssuedError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleSubmit() {
    // Mirror the server refine (createShareClassSchema): block issued > authorized.
    if (
      totalAuthorized != null &&
      totalIssued != null &&
      totalIssued > totalAuthorized
    ) {
      setIssuedError("Issued shares cannot exceed authorized shares.");
      return;
    }
    setIssuedError(null);
    setSaving(true);
    try {
      const res = await apiFetch(
        isEdit ? `/api/share-classes/${existing!.id}` : "/api/share-classes",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            classType,
            totalAuthorized: totalAuthorized ?? 0,
            totalIssued: totalIssued ?? 0,
            liquidationPreference: liquidationPreference ?? 1,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(toUserMessage(body));
        return;
      }
      toast.success(isEdit ? "Share class updated" : "Share class added");
      close();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        variant={isEdit ? "secondary" : "primary"}
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="open-add-share-class"
      >
        {isEdit ? "Edit" : "Add share class"}
      </Button>

      <Modal open={open} onClose={close} title={isEdit ? "Edit share class" : "Add share class"}>
        <div className="space-y-3">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select
            label="Class type"
            value={classType}
            onChange={(e) => setClassType(e.target.value as ClassType)}
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={saving}
              data-testid="submit-share-class"
            >
              {saving ? "Saving…" : isEdit ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
