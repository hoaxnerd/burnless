"use client";

import { useState } from "react";
import { Power, Database, Sparkles, DollarSign, Cpu, Eye, EyeOff, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { AI_FEATURE_LIST, type AiFeatureFlagsState, type AiDataMode } from "@burnless/ai";
import type { BudgetStatus, AiProviderConfig } from "@/components/ai/ai-feature-context";

interface AiFeaturesTabProps {
  flags: AiFeatureFlagsState;
  updateFlags: (patch: Partial<AiFeatureFlagsState & { monthlyBudgetCents?: number } & AiProviderConfig>) => void;
  monthlyBudgetCents: number;
  budget: BudgetStatus | null;
  providerConfig: AiProviderConfig;
}

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

// ── Provider Section ───────────────────────────────────────────────────────

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic", desc: "Claude models (default)" },
  { value: "openai", label: "OpenAI", desc: "GPT-4o, o4-mini, and more" },
  { value: "openrouter", label: "OpenRouter", desc: "Multi-provider routing" },
  { value: "ollama", label: "Ollama", desc: "Local models — no API key needed" },
] as const;

function ProviderSection({
  providerConfig,
  updateFlags,
}: {
  providerConfig: AiProviderConfig;
  updateFlags: (patch: Partial<AiProviderConfig>) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(providerConfig.aiModel ?? "");
  const [baseUrl, setBaseUrl] = useState(providerConfig.aiBaseUrl ?? "");
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testError, setTestError] = useState("");

  const selectedProvider = providerConfig.aiProvider ?? "anthropic";
  const hasCustomKey = !!providerConfig.aiApiKey;

  const handleProviderChange = (provider: string) => {
    updateFlags({ aiProvider: provider === "anthropic" ? null : provider });
    setTestStatus("idle");
  };

  const handleSaveKey = () => {
    if (!apiKey.trim()) return;
    updateFlags({ aiApiKey: apiKey.trim() });
    setApiKey("");
    setShowKey(false);
    setTestStatus("idle");
  };

  const handleClearKey = () => {
    updateFlags({ aiApiKey: null });
    setApiKey("");
    setTestStatus("idle");
  };

  const handleSaveModel = () => {
    updateFlags({ aiModel: model.trim() || null });
  };

  const handleSaveBaseUrl = () => {
    updateFlags({ aiBaseUrl: baseUrl.trim() || null });
  };

  const handleTestConnection = async () => {
    setTestStatus("testing");
    setTestError("");

    const testKey = apiKey.trim() || undefined;
    // Can't test without a real key — masked keys won't work (except Ollama, which needs none)
    if (!testKey && !hasCustomKey && selectedProvider !== "ollama") {
      setTestStatus("error");
      setTestError("Enter an API key first");
      return;
    }

    try {
      const res = await fetch("/api/ai-features/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey: testKey ?? "use-server-key",
          model: model.trim() || undefined,
          baseUrl: baseUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestStatus("success");
      } else {
        setTestStatus("error");
        setTestError(data.error || "Connection failed");
      }
    } catch {
      setTestStatus("error");
      setTestError("Network error");
    }
  };

  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
      <div className="flex items-center gap-4 mb-5">
        <div className="h-9 w-9 rounded-lg bg-surface-100 flex items-center justify-center">
          <Cpu className="h-[18px] w-[18px] text-surface-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-surface-900">
            AI Provider
          </h2>
          <p className="text-sm text-surface-500 mt-0.5">
            Choose which AI provider powers your features
          </p>
        </div>
      </div>

      {/* Provider selector */}
      <div className="space-y-2 mb-5">
        {PROVIDERS.map((p) => (
          <label
            key={p.value}
            className={`flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-all ${
              selectedProvider === p.value
                ? "border-brand-500 bg-brand-50 shadow-sm"
                : "border-surface-200 hover:bg-surface-50 hover:border-surface-300"
            }`}
          >
            <input
              type="radio"
              name="aiProvider"
              value={p.value}
              checked={selectedProvider === p.value}
              onChange={() => handleProviderChange(p.value)}
              className="h-4 w-4 text-brand-600 focus:ring-brand-500"
            />
            <div>
              <span className="text-sm font-medium text-surface-900">
                {p.label}
              </span>
              <p className="text-xs text-surface-500 mt-0.5">
                {p.desc}
              </p>
            </div>
          </label>
        ))}
      </div>

      {/* API Key — not needed for Ollama */}
      {selectedProvider !== "ollama" && <div className="space-y-3 mb-5">
        <label className="block text-sm font-medium text-surface-700">
          API Key
        </label>
        {hasCustomKey && !apiKey ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 rounded-lg border border-surface-200 bg-surface-50 text-sm text-surface-500 font-mono">
              {providerConfig.aiApiKey}
            </div>
            <button
              onClick={handleClearKey}
              className="px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter your ${PROVIDERS.find((p) => p.value === selectedProvider)?.label} API key`}
                className="w-full px-3 py-2 pr-10 rounded-lg border border-surface-300 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <button
              onClick={handleSaveKey}
              disabled={!apiKey.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Save
            </button>
          </div>
        )}
        <p className="text-xs text-surface-400">
          {hasCustomKey
            ? "Your API key is stored securely. Remove it to fall back to server defaults."
            : "Leave blank to use the server\u2019s default API key (if configured)."}
        </p>
      </div>}

      {/* Ollama hint */}
      {selectedProvider === "ollama" && (
        <div className="rounded-xl bg-surface-50 border border-surface-200 p-4 mb-5">
          <p className="text-sm text-surface-600">
            Ollama runs locally — no API key required. Make sure Ollama is running
            and set the base URL below if it&apos;s not at the default address.
          </p>
        </div>
      )}

      {/* Model override */}
      <div className="space-y-2 mb-5">
        <label className="block text-sm font-medium text-surface-700">
          Model override <span className="text-surface-400 font-normal">(optional)</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onBlur={handleSaveModel}
            onKeyDown={(e) => e.key === "Enter" && handleSaveModel()}
            placeholder={selectedProvider === "openai" ? "gpt-4o" : selectedProvider === "openrouter" ? "anthropic/claude-sonnet-4-20250514" : selectedProvider === "ollama" ? "gemma3:12b" : "claude-sonnet-4-20250514"}
            className="flex-1 px-3 py-2 rounded-lg border border-surface-300 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>
      </div>

      {/* Base URL override (show for openrouter and ollama) */}
      {(selectedProvider === "openrouter" || selectedProvider === "ollama") && (
        <div className="space-y-2 mb-5">
          <label className="block text-sm font-medium text-surface-700">
            Base URL <span className="text-surface-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            onBlur={handleSaveBaseUrl}
            onKeyDown={(e) => e.key === "Enter" && handleSaveBaseUrl()}
            placeholder={selectedProvider === "ollama" ? "http://localhost:11434/v1" : "https://openrouter.ai/api/v1"}
            className="w-full px-3 py-2 rounded-lg border border-surface-300 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>
      )}

      {/* Test Connection */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleTestConnection}
          disabled={testStatus === "testing"}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-surface-300 text-surface-700 hover:bg-surface-50 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {testStatus === "testing" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Testing...
            </>
          ) : (
            "Test Connection"
          )}
        </button>
        {testStatus === "success" && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            Connected
          </span>
        )}
        {testStatus === "error" && (
          <span className="flex items-center gap-1 text-sm text-red-600">
            <XCircle className="h-4 w-4" />
            {testError}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Budget Section ──────────────────────────────────────────────────────────

const BUDGET_PRESETS = [
  { label: "$10/mo", cents: 1000 },
  { label: "$25/mo", cents: 2500 },
  { label: "$50/mo", cents: 5000 },
  { label: "$100/mo", cents: 10000 },
  { label: "$250/mo", cents: 25000 },
];

function BudgetSection({
  monthlyBudgetCents,
  budget,
  updateFlags,
}: {
  monthlyBudgetCents: number;
  budget: BudgetStatus | null;
  updateFlags: (patch: { monthlyBudgetCents: number }) => void;
}) {
  const [customValue, setCustomValue] = useState("");
  const [showCustom, setShowCustom] = useState(
    !BUDGET_PRESETS.some((p) => p.cents === monthlyBudgetCents)
  );

  const spentDollars = budget ? (budget.spentCents / 100).toFixed(2) : "0.00";
  const budgetDollars = (monthlyBudgetCents / 100).toFixed(2);
  const percentUsed = budget?.percentUsed ?? 0;

  const barColor =
    percentUsed >= 100
      ? "bg-red-500"
      : percentUsed >= 80
        ? "bg-amber-500"
        : "bg-brand-500";

  const statusColor =
    percentUsed >= 100
      ? "text-red-600"
      : percentUsed >= 80
        ? "text-amber-600"
        : "text-surface-500";

  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
      <div className="flex items-center gap-4 mb-5">
        <div className="h-9 w-9 rounded-lg bg-surface-100 flex items-center justify-center">
          <DollarSign className="h-[18px] w-[18px] text-surface-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-surface-900">
            AI Budget
          </h2>
          <p className="text-sm text-surface-500 mt-0.5">
            Set a monthly spending cap to prevent surprise costs
          </p>
        </div>
      </div>

      {/* Usage bar */}
      <div className="mb-5">
        <div className="flex justify-between items-baseline mb-2">
          <span className="text-sm font-medium text-surface-700">
            ${spentDollars} <span className="text-surface-400">of</span> ${budgetDollars}
          </span>
          <span className={`text-xs font-medium ${statusColor}`}>
            {percentUsed >= 100
              ? "Budget exceeded"
              : percentUsed >= 80
                ? "Approaching limit"
                : `${percentUsed.toFixed(1)}% used`}
          </span>
        </div>
        <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(percentUsed, 100)}%` }}
          />
        </div>
        {budget?.exceeded && (
          <p className="text-xs text-red-600 mt-2">
            AI features are paused. Increase your budget or wait until next month.
          </p>
        )}
        {budget?.warning && !budget.exceeded && (
          <p className="text-xs text-amber-600 mt-2">
            You&apos;re approaching your AI budget limit. Consider increasing your cap.
          </p>
        )}
      </div>

      {/* Budget presets */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-surface-700">Monthly cap</p>
        <div className="flex flex-wrap gap-2">
          {BUDGET_PRESETS.map((preset) => (
            <button
              key={preset.cents}
              onClick={() => {
                setShowCustom(false);
                updateFlags({ monthlyBudgetCents: preset.cents });
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                monthlyBudgetCents === preset.cents && !showCustom
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-surface-100 text-surface-700 hover:bg-surface-200"
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={() => {
              setShowCustom(true);
              setCustomValue((monthlyBudgetCents / 100).toString());
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              showCustom
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-surface-100 text-surface-700 hover:bg-surface-200"
            }`}
          >
            Custom
          </button>
        </div>

        {showCustom && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm text-surface-500">$</span>
            <input
              type="number"
              min="0"
              max="10000"
              step="1"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onBlur={() => {
                const cents = Math.round(parseFloat(customValue || "0") * 100);
                if (cents >= 0 && cents <= 1_000_000) {
                  updateFlags({ monthlyBudgetCents: cents });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const cents = Math.round(parseFloat(customValue || "0") * 100);
                  if (cents >= 0 && cents <= 1_000_000) {
                    updateFlags({ monthlyBudgetCents: cents });
                  }
                }
              }}
              className="w-28 px-3 py-1.5 rounded-lg border border-surface-300 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="50"
            />
            <span className="text-sm text-surface-500">/month</span>
          </div>
        )}
      </div>
    </div>
  );
}
