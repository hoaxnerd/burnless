"use client";

import { useState } from "react";
import { Power, Database, Sparkles, Pencil } from "lucide-react";
import { AI_FEATURE_LIST, DEFAULT_COMPANION_NAME, type AiFeatureFlagsState, type AiDataMode } from "@burnless/ai";
import type { CreditStatus } from "@/components/ai/ai-feature-context";
import { AiProvidersManager } from "./ai-providers/ai-providers-manager";
import { Input } from "@/components/ui";
import { useCapabilities } from "@/components/providers/capability-context";

interface AiFeaturesTabProps {
  flags: AiFeatureFlagsState;
  updateFlags: (patch: Partial<AiFeatureFlagsState>) => void;
  credits: CreditStatus | null;
}

const DATA_MODES: { value: AiDataMode; label: string; desc: string }[] = [
  { value: "full", label: "Full", desc: "Generate new AI content and show cached results" },
  { value: "show_cached", label: "Cached Only", desc: "Show previously generated AI data, no new LLM calls" },
  { value: "hide_all", label: "Hide All", desc: "Hide all AI-generated content entirely" },
];

export function AiFeaturesTab({ flags, updateFlags, credits }: AiFeaturesTabProps) {
  // Task 12: credits are a billing concept — hide the block when billing is off.
  const caps = useCapabilities();
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

      {/* Companion Name */}
      {flags.masterEnabled && (
        <CompanionNameField
          value={flags.companionName ?? DEFAULT_COMPANION_NAME}
          onChange={(name) => updateFlags({ companionName: name })}
        />
      )}

      {/* AI Providers manager (#49 P3) — self-host only; cloud uses managed keys. */}
      {flags.masterEnabled && !caps.managedAiProvider && <AiProvidersManager />}

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

      {/* AI tool permissions (per-user) now live in the AI Companion → Tools pane
          (S3b unified Tools pane: Workspace + Web posture). Removed from here to
          keep a single home for tool enablement + posture. */}

      {/* AI Credits Status — Task 12: gated on billing capability */}
      {caps.billing && credits && (
        <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
          <div className="flex items-center gap-4 mb-5">
            <div className="h-9 w-9 rounded-lg bg-surface-100 flex items-center justify-center">
              <Sparkles className="h-[18px] w-[18px] text-surface-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-surface-900">AI Credits</h2>
              <p className="text-sm text-surface-500 mt-0.5">
                Your plan includes {credits.total.toLocaleString()} credits per month
              </p>
            </div>
          </div>
          <div className="mb-2">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-sm font-medium text-surface-700">
                {credits.used.toLocaleString()} <span className="text-surface-400">of</span> {credits.total.toLocaleString()} credits
              </span>
              <span className={`text-xs font-medium ${
                credits.exceeded ? "text-danger-600" : credits.warning ? "text-warning-600" : "text-surface-500"
              }`}>
                {credits.exceeded
                  ? "Credits exhausted"
                  : credits.warning
                    ? "Running low"
                    : `${credits.remaining.toLocaleString()} remaining`}
              </span>
            </div>
            <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  credits.exceeded ? "bg-danger-500" : credits.warning ? "bg-warning-500" : "bg-brand-500"
                }`}
                style={{ width: `${Math.min(credits.percentUsed, 100)}%` }}
              />
            </div>
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

/* ── Companion name inline editor ────────────────────────────── */

function CompanionNameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onChange(trimmed);
    else setDraft(value);
    setEditing(false);
  };

  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
      <div className="flex items-center gap-4">
        <div className="h-9 w-9 rounded-lg bg-surface-100 flex items-center justify-center">
          <Pencil className="h-[18px] w-[18px] text-surface-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-surface-900">Companion Name</h2>
          <p className="text-sm text-surface-500 mt-0.5">
            Personalize the name shown throughout the app
          </p>
        </div>
      </div>
      <div className="mt-4">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              aria-label="Companion name"
              type="text"
              maxLength={50}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
              className="flex-1"
            />
            <button onClick={save} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors">Save</button>
            <button onClick={() => { setDraft(value); setEditing(false); }} className="rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium text-surface-600 hover:bg-surface-50 transition-colors">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => { setDraft(value); setEditing(true); }}
            className="group flex items-center gap-2 rounded-lg border border-surface-200 px-3 py-2 text-sm text-surface-900 hover:border-surface-300 hover:bg-surface-50 transition-all"
          >
            <Sparkles className="h-3.5 w-3.5 text-brand-500" />
            <span className="font-medium">{value}</span>
            <Pencil className="h-3 w-3 text-surface-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
      </div>
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
