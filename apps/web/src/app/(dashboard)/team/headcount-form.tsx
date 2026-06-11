"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { Modal } from "@/components/ui";
import { toUserMessage } from "@/lib/api-error";
import type { BenefitsBreakdown } from "@/lib/headcount-params";
import { HeadcountFormBody } from "./headcount-form-body";

/**
 * Canonical label for the add-headcount action. Empty-state copy MUST reference
 * this so the call-to-action text can't drift from the real button (SHELL-05 / TEAM-10).
 */
export const ADD_HIRE_LABEL = "Add hire";

interface Department {
  id: string;
  name: string;
}

export interface EditableHeadcount {
  id: string;
  departmentId: string;
  title: string;
  name?: string | null;
  employeeType: "full_time" | "part_time" | "contractor";
  count: number | string;
  salary: string | number;
  hourlyRate: string | number | null;
  hoursPerWeek: string | number | null;
  startDate: string;
  endDate?: string | null;
  benefitsRate: string | number;
  parameters?: { benefitsBreakdown?: BenefitsBreakdown } | null;
}

interface Props {
  departments: Department[];
  companyBenefitsRates?: BenefitsBreakdown;
  edit?: EditableHeadcount;
  open?: boolean;
  onClose?: () => void;
}

/**
 * Consolidated add/edit form for headcount entries.
 * Thin wrapper: owns the trigger button + <Modal> + persistence (apiFetch +
 * router.refresh); the controlled field body lives in <HeadcountFormBody>.
 */
export function HeadcountForm({
  departments,
  companyBenefitsRates,
  edit,
  open: controlledOpen,
  onClose,
}: Props) {
  const router = useRouter();
  const isEditMode = !!edit;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;

  function handleClose() {
    if (controlledOpen === undefined) setInternalOpen(false);
    onClose?.();
  }

  async function handleSubmit(payload: Record<string, unknown>) {
    const url = isEditMode ? `/api/headcount/${edit!.id}` : `/api/headcount`;
    const method = isEditMode ? "PATCH" : "POST";
    const res = await apiFetch(url, {
      method,
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(toUserMessage(body));
    }
    handleClose();
    router.refresh();
  }

  return (
    <>
      {controlledOpen === undefined && (
        <button
          type="button"
          onClick={() => setInternalOpen(true)}
          data-testid="open-headcount-form"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          {ADD_HIRE_LABEL}
        </button>
      )}
      <Modal open={open} onClose={handleClose} title={isEditMode ? "Edit hire" : "Add hire"} size="xl">
        <HeadcountFormBody
          departments={departments}
          companyBenefitsRates={companyBenefitsRates}
          initial={edit}
          submitLabel={isEditMode ? "Save changes" : "Add hire"}
          onCancel={handleClose}
          onSubmit={handleSubmit}
        />
      </Modal>
    </>
  );
}
