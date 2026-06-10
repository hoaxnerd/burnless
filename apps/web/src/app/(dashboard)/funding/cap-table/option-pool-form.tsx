"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { Modal, Input, Button, IconButton } from "@/components/ui";
import { Pencil } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { NumberInput } from "@/components/forms/primitives";
import { toUserMessage } from "@/lib/api-error";
import type { OptionPoolRow } from "./cap-table-view";

/**
 * U3 — option-pool add/edit form. Cap-table structure is base-data-only
 * (Phase 3 F §F5); the API route owns scenario safety (409 if a scenario is
 * active) AND the single-pool guard (409 SINGLE_POOL_ONLY on a 2nd pool — there
 * is no optionPoolId column to attribute grants). apiFetch is the SOLE
 * X-Scenario-Id injector — never set manually. Cap-table is currency-agnostic:
 * reserved shares are integers; no currency formatting here.
 */

interface Props {
  /** Pass to edit an existing pool; omit to add a new one. */
  existing?: OptionPoolRow;
}

export function OptionPoolForm({ existing }: Props) {
  const router = useRouter();
  const toast = useToast();
  const isEdit = existing != null;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(existing?.name ?? "");
  const [totalReserved, setTotalReserved] = useState<number | null>(
    existing ? Number(existing.totalReserved) : null,
  );
  const [saving, setSaving] = useState(false);

  function reset() {
    setName(existing?.name ?? "");
    setTotalReserved(existing ? Number(existing.totalReserved) : null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const res = await apiFetch(
        isEdit ? `/api/option-pools/${existing!.id}` : "/api/option-pools",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            totalReserved: totalReserved ?? 0,
          }),
        },
      );
      if (!res.ok) {
        // Surfaces the single-pool 409 ("only one option pool supported")
        // cleanly — toUserMessage reads the route's { error } body.
        const body = await res.json().catch(() => ({}));
        toast.error(toUserMessage(body));
        return;
      }
      toast.success(isEdit ? "Option pool updated" : "Option pool added");
      close();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {isEdit ? (
        <IconButton
          variant="ghost"
          size="sm"
          icon={<Pencil />}
          aria-label="Edit"
          onClick={() => setOpen(true)}
          data-testid="open-add-option-pool"
        />
      ) : (
        <Button
          variant="primary"
          size="sm"
          onClick={() => setOpen(true)}
          data-testid="open-add-option-pool"
        >
          Add option pool
        </Button>
      )}

      <Modal open={open} onClose={close} title={isEdit ? "Edit option pool" : "Add option pool"}>
        <div className="space-y-3">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <NumberInput
            label="Reserved shares"
            value={totalReserved}
            onChange={setTotalReserved}
            min={0}
            integerOnly
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
              data-testid="submit-option-pool"
            >
              {saving ? "Saving…" : isEdit ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
