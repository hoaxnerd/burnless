"use client";

import { forwardRef, useImperativeHandle } from "react";
import { AiProvidersManager } from "@/app/(dashboard)/settings/ai-providers/ai-providers-manager";
import type { WizardStepHandle } from "../types";

export interface AiConfigStepProps {}

/**
 * Wizard config step (S4b) — the FIRST `kind: "configuration"` item (see
 * ../config-item.ts). Self-host only: page.tsx gates it on
 * `!caps.managedAiProvider`, mirroring the Settings → AI manager (hidden on
 * cloud, where providers are managed).
 *
 * Reuses the P3 `<AiProvidersManager />` VERBATIM (propless, self-fetches via
 * useAiProviders, hosts ProviderModal with create/edit + Test/Fetch + encrypted
 * key). Provider creation is immediate (modal Save → POST /api/ai-features/
 * providers → SWR revalidate), so this step has NO deferred work: `submit()`
 * is a pure pass-through that always resolves `true`. Continue just advances;
 * the step is optional and the shell shows Skip. No-AI path still works (data
 * steps fall back to manual entry).
 */
export const AiConfigStep = forwardRef<WizardStepHandle, AiConfigStepProps>(
  function AiConfigStep(_props, ref) {
    useImperativeHandle(ref, () => ({ submit: async () => true }));

    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
            Connect your AI
          </h2>
          <p className="text-sm text-surface-500 dark:text-surface-400">
            Bring your own provider to power chat, insights and automations.
          </p>
        </div>

        <AiProvidersManager />

        <p className="text-xs text-surface-400">
          Optional — you can add this later in Settings.
        </p>
      </div>
    );
  },
);
