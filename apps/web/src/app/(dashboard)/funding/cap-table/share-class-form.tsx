"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { Modal, Button, IconButton } from "@/components/ui";
import { Pencil } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { toUserMessage } from "@/lib/api-error";
import { ShareClassFormFields, type ShareClassValues } from "./share-class-form-fields";
import type { ShareClassRow } from "./cap-table-view";

/**
 * U2 — share-class add/edit form. Thin wrapper (S4b Task 3): owns the trigger
 * button, <Modal>, apiFetch persistence, toast + router.refresh, and renders
 * the controlled <ShareClassFormFields> inside. Cap-table structure is
 * base-data-only (Phase 3 F §F5); the API route owns scenario safety (409 if a
 * scenario is active). apiFetch is the SOLE X-Scenario-Id injector — never set
 * manually. Cap-table is currency-agnostic.
 */

interface Props {
  /** Pass to edit an existing class; omit to add a new one. */
  existing?: ShareClassRow;
}

export function ShareClassForm({ existing }: Props) {
  const router = useRouter();
  const toast = useToast();
  const isEdit = existing != null;

  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
  }

  const initial: Partial<ShareClassValues> | undefined = existing
    ? {
        name: existing.name,
        classType: existing.classType,
        totalAuthorized: Number(existing.totalAuthorized),
        totalIssued: Number(existing.totalIssued),
        liquidationPreference:
          existing.liquidationPreference != null ? Number(existing.liquidationPreference) : 1,
      }
    : undefined;

  async function handleSubmit(values: ShareClassValues) {
    const res = await apiFetch(
      isEdit ? `/api/share-classes/${existing!.id}` : "/api/share-classes",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(toUserMessage(body));
      throw new Error("save failed");
    }
    toast.success(isEdit ? "Share class updated" : "Share class added");
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
          data-testid="open-add-share-class"
        />
      ) : (
        <Button
          variant="primary"
          size="sm"
          onClick={() => setOpen(true)}
          data-testid="open-add-share-class"
        >
          Add share class
        </Button>
      )}

      <Modal open={open} onClose={close} title={isEdit ? "Edit share class" : "Add share class"}>
        <ShareClassFormFields initial={initial} onSubmit={handleSubmit} onCancel={close} />
      </Modal>
    </>
  );
}
