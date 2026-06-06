"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui";
import { RevenueStreamForm, type RevenueStreamFormValues } from "./revenue-stream-form";
import { apiFetch } from "@/lib/api-fetch";

interface AddRevenueStreamButtonProps {
  scenarioId: string | null;
}

export function AddRevenueStreamButton({ scenarioId }: AddRevenueStreamButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(values: RevenueStreamFormValues) {
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/revenue-streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create revenue stream");
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add Revenue Stream
      </button>

      {open && (
        <Modal open={open} onClose={() => setOpen(false)} title="Add Revenue Stream">
          <RevenueStreamForm
            mode="add"
            onSubmit={handleSubmit}
            onCancel={() => setOpen(false)}
            submitting={submitting}
          />
        </Modal>
      )}
    </>
  );
}
