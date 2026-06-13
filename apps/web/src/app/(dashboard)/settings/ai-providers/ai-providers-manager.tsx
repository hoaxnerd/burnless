"use client";

import { useState } from "react";
import { Boxes, Plus } from "lucide-react";
import { Button, DataEmptyState } from "@/components/ui";
import { updateAiProvider, useAiProviders } from "@/lib/swr";
import { ProviderModal } from "./provider-modal";
import { ProviderRow } from "./provider-row";
import type { AiProviderPublic } from "./types";

/**
 * AiProvidersManager (#49 P3, Task 6) — the top-level Settings → AI card.
 * Lists connected providers, shows the empty state, hosts the Add-provider
 * affordance, and orchestrates the modal + enable/disable toggle.
 * Pixel contract: docs/.../2026-06-13-universal-ai-provider/ai-providers-settings.html
 * (populated-list card + empty-state card).
 */
export function AiProvidersManager() {
  const { data, isLoading } = useAiProviders();
  const providers = data?.providers ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AiProviderPublic | null>(null);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(provider: AiProviderPublic) {
    setEditing(provider);
    setModalOpen(true);
  }

  async function handleToggle(provider: AiProviderPublic) {
    await updateAiProvider(provider.id, { enabled: !provider.enabled });
  }

  const isInitialLoad = isLoading && !data;
  const showEmpty = !isInitialLoad && providers.length === 0;

  return (
    <section className="rounded-2xl border border-surface-200 bg-surface-0 p-6 sm:p-8">
      <div className="mb-[18px] flex items-center gap-3.5">
        <div className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[11px] bg-accent-100 text-accent-600">
          <Boxes className="h-[18px] w-[18px]" />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-surface-900">AI Providers</h2>
          <p className="mt-0.5 text-[13px] text-surface-500">
            Connect any provider — cloud, OpenRouter, or a local / custom endpoint. Used across chat, insights &amp; automations.
          </p>
        </div>
      </div>

      {isInitialLoad ? null : showEmpty ? (
        <DataEmptyState
          icon={Boxes}
          title="No AI provider connected"
          body="Connect a provider to turn on chat, insights, automations and the worklog. Bring your own key — or point at a local model."
          action={
            <Button type="button" variant="primary" size="md" icon={<Plus className="h-[15px] w-[15px]" />} onClick={openCreate}>
              Add your first provider
            </Button>
          }
        />
      ) : (
        <>
          {providers.map((provider) => (
            <ProviderRow
              key={provider.id}
              provider={provider}
              testState="idle"
              onToggle={() => handleToggle(provider)}
              onEdit={() => openEdit(provider)}
            />
          ))}
          <button
            type="button"
            onClick={openCreate}
            className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-surface-300 bg-brand-50 px-3.5 py-3 text-[13.5px] font-semibold text-brand-700 transition-colors hover:bg-brand-100"
          >
            <Plus className="h-[17px] w-[17px]" strokeWidth={2.2} />
            Add provider
          </button>
        </>
      )}

      <ProviderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        provider={editing}
        onSaved={() => setModalOpen(false)}
      />
    </section>
  );
}
