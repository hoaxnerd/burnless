"use client";

import { Power, Database, Sparkles } from "lucide-react";
import { AI_FEATURE_LIST, type AiFeatureFlagsState, type AiDataMode } from "@burnless/ai";

interface AiFeaturesTabProps {
  flags: AiFeatureFlagsState;
  updateFlags: (patch: Partial<AiFeatureFlagsState>) => void;
}

export function AiFeaturesTab({ flags, updateFlags }: AiFeaturesTabProps) {
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

      {/* Level 3: Data Retention Mode */}
      {flags.masterEnabled && (
        <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
          <div className="flex items-center gap-4 mb-5">
            <div className="h-9 w-9 rounded-lg bg-surface-100 flex items-center justify-center">
              <Database className="h-[18px] w-[18px] text-surface-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-surface-900">
                AI Data Mode
              </h2>
              <p className="text-sm text-surface-500 mt-0.5">
                Control how AI generates and displays data
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {(
              [
                {
                  value: "full" as AiDataMode,
                  label: "Full",
                  desc: "Generate new AI content and show cached results",
                },
                {
                  value: "show_cached" as AiDataMode,
                  label: "Cached Only",
                  desc: "Show previously generated AI data, no new LLM calls",
                },
                {
                  value: "hide_all" as AiDataMode,
                  label: "Hide All",
                  desc: "Hide all AI-generated content entirely",
                },
              ]
            ).map((mode) => (
              <label
                key={mode.value}
                className={`flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-all ${
                  flags.dataMode === mode.value
                    ? "border-brand-500 bg-brand-50 shadow-sm"
                    : "border-surface-200 hover:bg-surface-50 hover:border-surface-300"
                }`}
              >
                <input
                  type="radio"
                  name="dataMode"
                  value={mode.value}
                  checked={flags.dataMode === mode.value}
                  onChange={() => updateFlags({ dataMode: mode.value })}
                  className="h-4 w-4 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <span className="text-sm font-medium text-surface-900">
                    {mode.label}
                  </span>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {mode.desc}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>
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
