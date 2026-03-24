"use client";

import { Power, Database, Sparkles, Shield } from "lucide-react";
import { AI_FEATURE_LIST, type AiFeatureFlagsState, type AiDataMode, type AiWriteMode } from "@burnless/ai";
import type { BudgetStatus, AiProviderConfig } from "@/components/ai/ai-feature-context";
import { ProviderSection } from "./ai-provider-section";
import { BudgetSection } from "./ai-budget-section";

interface AiFeaturesTabProps {
  flags: AiFeatureFlagsState;
  updateFlags: (patch: Partial<AiFeatureFlagsState & { monthlyBudgetCents?: number } & AiProviderConfig>) => void;
  monthlyBudgetCents: number;
  budget: BudgetStatus | null;
  providerConfig: AiProviderConfig;
}

const DATA_MODES: { value: AiDataMode; label: string; desc: string }[] = [
  { value: "full", label: "Full", desc: "Generate new AI content and show cached results" },
  { value: "show_cached", label: "Cached Only", desc: "Show previously generated AI data, no new LLM calls" },
  { value: "hide_all", label: "Hide All", desc: "Hide all AI-generated content entirely" },
];

const WRITE_MODES: { value: AiWriteMode; label: string; desc: string }[] = [
  { value: "full", label: "Full Access", desc: "AI can create, update, and delete entries freely" },
  { value: "confirm", label: "Confirm First", desc: "AI describes changes and asks for your confirmation before making them" },
  { value: "read_only", label: "Read Only", desc: "AI can analyze and report but cannot modify any data" },
];

export function AiFeaturesTab({ flags, updateFlags, monthlyBudgetCents, budget, providerConfig }: AiFeaturesTabProps) {
  return (
    <div className="space-y-6 max-w-2xl">
      {/* Level 1: Master Switch */}
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-brand-100 flex items-center justify-center">
              <Power className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-surface-900">
                AI Master Switch
              </h2>
              <p className="text-sm text-surface-500 mt-0.5">
                {flags.masterEnabled
                  ? "AI features are active across the platform"
                  : "All AI features are disabled \u2014 pure deterministic mode"}
              </p>
            </div>
          </div>
          <button
            onClick={() =>
              updateFlags({ masterEnabled: !flags.masterEnabled })
            }
            className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
              flags.masterEnabled
                ? "bg-brand-600"
                : "bg-surface-300"
            }`}
            role="switch"
            aria-checked={flags.masterEnabled}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                flags.masterEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* AI Provider Selector */}
      {flags.masterEnabled && (
        <ProviderSection
          providerConfig={providerConfig}
          updateFlags={updateFlags}
        />
      )}

      {/* Level 3: Data Retention Mode */}
      {flags.masterEnabled && (
        <RadioSection
          icon={<Database className="h-[18px] w-[18px] text-surface-600" />}
          title="AI Data Mode"
          description="Control how AI generates and displays data"
          name="dataMode"
          options={DATA_MODES}
          value={flags.dataMode}
          onChange={(value) => updateFlags({ dataMode: value })}
        />
      )}

      {/* AI Write Mode (Guardrails) */}
      {flags.masterEnabled && (
        <RadioSection
          icon={<Shield className="h-[18px] w-[18px] text-surface-600" />}
          title="AI Write Access"
          description="Control whether AI can create, update, or delete your data"
          name="writeMode"
          options={WRITE_MODES}
          value={flags.writeMode ?? "full"}
          onChange={(value) => updateFlags({ writeMode: value })}
        />
      )}

      {/* Budget Enforcement */}
      {flags.masterEnabled && (
        <BudgetSection
          monthlyBudgetCents={monthlyBudgetCents}
          budget={budget}
          updateFlags={updateFlags}
        />
      )}

      {/* Level 2: Per-Feature Switches */}
      {flags.masterEnabled && (
        <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
          <div className="flex items-center gap-4 mb-5">
            <div className="h-9 w-9 rounded-lg bg-surface-100 flex items-center justify-center">
              <Sparkles className="h-[18px] w-[18px] text-surface-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-surface-900">
                Feature Toggles
              </h2>
              <p className="text-sm text-surface-500 mt-0.5">
                Enable or disable individual AI capabilities
              </p>
            </div>
          </div>
          <div className="divide-y divide-surface-100">
            {AI_FEATURE_LIST.map((feat) => {
              const isOn =
                flags.features[feat.name as keyof typeof flags.features];
              return (
                <div
                  key={feat.name}
                  className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium text-surface-900">
                      {feat.label}
                    </p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      {feat.description}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      updateFlags({
                        features: {
                          ...flags.features,
                          [feat.name]: !isOn,
                        },
                      })
                    }
                    className={`relative inline-flex h-6 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                      isOn
                        ? "bg-brand-600"
                        : "bg-surface-300"
                    }`}
                    role="switch"
                    aria-checked={isOn}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isOn ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Reusable radio-group section ─────────────────────────────── */

function RadioSection<T extends string>({
  icon,
  title,
  description,
  name,
  options,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  name: string;
  options: { value: T; label: string; desc: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
      <div className="flex items-center gap-4 mb-5">
        <div className="h-9 w-9 rounded-lg bg-surface-100 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold text-surface-900">{title}</h2>
          <p className="text-sm text-surface-500 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="space-y-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={`flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-all ${
              value === opt.value
                ? "border-brand-500 bg-brand-50 shadow-sm"
                : "border-surface-200 hover:bg-surface-50 hover:border-surface-300"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="h-4 w-4 text-brand-600 focus:ring-brand-500"
            />
            <div>
              <span className="text-sm font-medium text-surface-900">
                {opt.label}
              </span>
              <p className="text-xs text-surface-500 mt-0.5">{opt.desc}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
