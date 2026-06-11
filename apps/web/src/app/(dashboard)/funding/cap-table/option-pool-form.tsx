"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { Modal, Button, IconButton } from "@/components/ui";
import { Pencil } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { toUserMessage } from "@/lib/api-error";
import { OptionPoolFormFields, type OptionPoolValues } from "./option-pool-form-fields";
import type { OptionPoolRow } from "./cap-table-view";

/**
 * U3 — option-pool add/edit form. Thin wrapper (S4b Task 3): owns the trigger
 * button, <Modal>, apiFetch persistence, toast + router.refresh, and renders
 * the controlled <OptionPoolFormFields> inside. Cap-table structure is
 * base-data-only (Phase 3 F §F5); the API route owns scenario safety (409 if a
 * scenario is active) AND the single-pool guard (409 SINGLE_POOL_ONLY on a 2nd
 * pool — there is no optionPoolId column to attribute grants). apiFetch is the
 * SOLE X-Scenario-Id injector — never set manually. Cap-table is
 * currency-agnostic: reserved shares are integers.
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

  function close() {
    setOpen(false);
  }

  const initial: Partial<OptionPoolValues> | undefined = existing
    ? { name: existing.name, totalReserved: Number(existing.totalReserved) }
    : undefined;

  async function handleSubmit(values: OptionPoolValues) {
    const res = await apiFetch(
      isEdit ? `/api/option-pools/${existing!.id}` : "/api/option-pools",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      },
    );
    if (!res.ok) {
      // Surfaces the single-pool 409 ("only one option pool supported")
      // cleanly — toUserMessage reads the route's { error } body.
      const body = await res.json().catch(() => ({}));
      toast.error(toUserMessage(body));
      throw new Error("save failed");
    }
    toast.success(isEdit ? "Option pool updated" : "Option pool added");
    close();
    router.refresh();
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
        <OptionPoolFormFields initial={initial} onSubmit={handleSubmit} onCancel={close} />
      </Modal>
    </>
  );
}
