"use client";

import { forwardRef, useImperativeHandle } from "react";
import { AiProvidersManager } from "@/app/(dashboard)/settings/ai-providers/ai-providers-manager";
import type { WizardStepHandle } from "../types";

/**
 * Wizard config step (S4b) — the FIRST `kind: "configuration"` item (see
 * ../config-item.ts). Self-host only: the wizard reads the single
 * `aiConfigDescriptor` (../ai-config-descriptor.tsx) and gates this step on its
 * `hiddenWhenCapability: "managedAiProvider"` being OFF, mirroring the
 * Settings → AI manager (hidden on cloud, where providers are managed).
 *
 * Reuses the P3 `<AiProvidersManager />` VERBATIM (propless, self-fetches via
 * useAiProviders, hosts ProviderModal with create/edit + Test/Fetch + encrypted
 * key). Provider creation is immediate (modal Save → POST /api/ai-features/
 * providers → SWR revalidate), so this step has NO deferred work: `submit()`
 * is a pure pass-through that always resolves `true`. Continue just advances;
 * the step is optional and the shell shows Skip. No-AI path still works (data
 * steps fall back to manual entry).
 *
 * The panel heading (title/description) is SOURCED FROM the descriptor (single
 * source of truth): `aiConfigDescriptor.render` threads them in as props, so
 * the copy is not duplicated between the descriptor and this component.
 */
export interface AiConfigStepProps {
  /** Panel heading — sourced from `aiConfigDescriptor.title`. */
  title: string;
  /** Panel sub-header — sourced from `aiConfigDescriptor.description`. */
  description: string;
}

export const AiConfigStep = forwardRef<WizardStepHandle, AiConfigStepProps>(
  function AiConfigStep({ title, description }, ref) {
    useImperativeHandle(ref, () => ({ submit: async () => true }));

    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
            {title}
          </h2>
          <p className="text-sm text-surface-500 dark:text-surface-400">
            {description}
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
