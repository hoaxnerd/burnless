"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui";
import { FundingRoundForm, type FundingRoundSubmitPayload } from "./funding-round-form";
import { apiFetch } from "@/lib/api-fetch";
import { extractApiError } from "@/lib/api-error";
import { useRouter } from "next/navigation";

export function AddFundingButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleSubmit(payload: FundingRoundSubmitPayload) {
    const res = await apiFetch("/api/funding-rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await extractApiError(res));
    // Refresh only after a successful save — Cancel/close must not hit the server.
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add Funding Round
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Funding Round">
        <FundingRoundForm mode="add" onSubmit={handleSubmit} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}
