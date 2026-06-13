"use client";
import { Pencil } from "lucide-react";
import { IconButton } from "@/components/ui";
import { ProviderLogo } from "./provider-logo";
import type { AiProviderPublic, ProviderTestState } from "./types";

function StatusChip({ state }: { state: ProviderTestState }) {
  if (state === "ok") return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success-600"><span className="h-[7px] w-[7px] rounded-full bg-success-500" />Connected</span>;
  if (state === "error") return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-danger-600"><span className="h-[7px] w-[7px] rounded-full bg-danger-500" />Error</span>;
  if (state === "testing") return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-surface-400"><span className="h-[7px] w-[7px] rounded-full bg-surface-300 animate-pulse" />Testing…</span>;
  return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-surface-400"><span className="h-[7px] w-[7px] rounded-full bg-surface-300" />Not tested</span>;
}

export function ProviderRow({ provider, testState, onToggle, onEdit }: {
  provider: AiProviderPublic; testState: ProviderTestState; onToggle: () => void; onEdit: () => void;
}) {
  const isCustom = provider.kind === "openai-compatible";
  const meta = isCustom
    ? `${provider.baseUrl ?? ""}${provider.defaultModelId ? ` · ${provider.defaultModelId}` : ""}`
    : `${provider.defaultModelId ?? "no default model"} · ${provider.modelCount} model${provider.modelCount === 1 ? "" : "s"}`;
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-surface-200 bg-white p-3.5 mb-2.5 transition-colors hover:border-surface-300 hover:bg-surface-50">
      <ProviderLogo kind={provider.kind} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-surface-900">
          <span className="truncate">{provider.name}</span>
          {provider.isDefault && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-brand-700">Default</span>}
          {isCustom && <span className="rounded-md bg-surface-100 px-1.5 py-0.5 text-[11px] font-normal text-surface-600">openai-compatible</span>}
        </div>
        <div className="mt-0.5 truncate font-mono text-xs text-surface-500">{meta}</div>
      </div>
      <StatusChip state={testState} />
      <button
        type="button" role="switch" aria-checked={provider.enabled}
        aria-label={`${provider.enabled ? "Disable" : "Enable"} ${provider.name}`}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-[42px] flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${provider.enabled ? "bg-brand-600" : "bg-surface-300"}`}
      >
        <span className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow ring-0 transition duration-200 ${provider.enabled ? "translate-x-[18px]" : "translate-x-0"}`} />
      </button>
      <IconButton aria-label={`Edit ${provider.name}`} variant="ghost" size="sm" icon={<Pencil className="h-[15px] w-[15px]" />} onClick={onEdit} />
    </div>
  );
}
