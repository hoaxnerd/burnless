"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { Cpu, Eye, EyeOff, Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { AiProviderConfig } from "@/components/ai/ai-feature-context";
import { Input } from "@/components/ui";
import { toUserMessage } from "@/lib/api-error";

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic", desc: "Claude models (default)" },
  { value: "openai", label: "OpenAI", desc: "GPT-4o, o4-mini, and more" },
  { value: "openrouter", label: "OpenRouter", desc: "Multi-provider routing" },
  { value: "ollama", label: "Ollama", desc: "Local models — no API key needed" },
] as const;

export function ProviderSection({
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
    if (!testKey && !hasCustomKey && selectedProvider !== "ollama") {
      setTestStatus("error");
      setTestError("Enter an API key first");
      return;
    }

    try {
      const res = await apiFetch("/api/ai-features/test-connection", {
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
        setTestError(toUserMessage(data) || "Connection failed");
      }
    } catch {
      setTestStatus("error");
      setTestError("Network error");
    }
  };

  return (
    <div className="border-t border-surface-200 pt-6">
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
              <Input
                aria-label="API key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter your ${PROVIDERS.find((p) => p.value === selectedProvider)?.label} API key`}
                className="w-full pr-10"
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
          <Input
            aria-label="Model override"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onBlur={handleSaveModel}
            onKeyDown={(e) => e.key === "Enter" && handleSaveModel()}
            placeholder={selectedProvider === "openai" ? "gpt-4o" : selectedProvider === "openrouter" ? "anthropic/claude-sonnet-4-20250514" : selectedProvider === "ollama" ? "gemma3:12b" : "claude-sonnet-4-20250514"}
            className="flex-1"
          />
        </div>
      </div>

      {/* Base URL override (show for openrouter and ollama) */}
      {(selectedProvider === "openrouter" || selectedProvider === "ollama") && (
        <div className="space-y-2 mb-5">
          <label className="block text-sm font-medium text-surface-700">
            Base URL <span className="text-surface-400 font-normal">(optional)</span>
          </label>
          <Input
            aria-label="Base URL"
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            onBlur={handleSaveBaseUrl}
            onKeyDown={(e) => e.key === "Enter" && handleSaveBaseUrl()}
            placeholder={selectedProvider === "ollama" ? "http://localhost:11434/v1" : "https://openrouter.ai/api/v1"}
            className="w-full"
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
