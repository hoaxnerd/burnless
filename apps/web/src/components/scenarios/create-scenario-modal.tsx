"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FileText, Sparkles, LayoutTemplate } from "lucide-react";
import { Modal, Button, FormField } from "@/components/ui";
import { apiFetch } from "@/lib/api-fetch";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface CreateScenarioModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (scenario: { id: string; name: string }) => void;
}

type CreationPath = "blank" | "ai" | "template";

interface TemplateOption {
  id: string;
  label: string;
  prompt: string;
}

/* ── Template definitions ───────────────────────────────────────────────── */

const TEMPLATES: TemplateOption[] = [
  {
    id: "fundraise",
    label: "Fundraise",
    prompt:
      "Create a fundraising scenario. Model a funding round with increased burn to accelerate growth, higher headcount, and marketing spend. Show the impact on runway and cash position.",
  },
  {
    id: "lean-ops",
    label: "Lean Operations",
    prompt:
      "Create a lean operations scenario. Cut discretionary spending, freeze non-critical hires, and extend runway as long as possible while maintaining core product development.",
  },
  {
    id: "growth",
    label: "Growth Acceleration",
    prompt:
      "Create a growth acceleration scenario. Increase sales and marketing spend aggressively, add revenue-generating headcount, and model the revenue upside against higher burn.",
  },
  {
    id: "hiring",
    label: "Hiring Plan",
    prompt:
      "Create a hiring plan scenario. Model the cost impact of planned hires across departments over the next 12 months, including salary, benefits, and ramp-up time.",
  },
];

/* ── Path cards config ──────────────────────────────────────────────────── */

const PATH_CARDS: {
  path: CreationPath;
  icon: typeof FileText;
  title: string;
  description: string;
  accent?: boolean;
}[] = [
  {
    path: "blank",
    icon: FileText,
    title: "Blank",
    description: "Start from current plan, make changes as you go",
  },
  {
    path: "ai",
    icon: Sparkles,
    title: "Ask AI",
    description: "Describe what you want to explore",
    accent: true,
  },
  {
    path: "template",
    icon: LayoutTemplate,
    title: "Template",
    description: "Fundraise, lean ops, growth, hiring plans",
  },
];

/* ── Component ──────────────────────────────────────────────────────────── */

export function CreateScenarioModal({ open, onClose, onCreated }: CreateScenarioModalProps) {
  const router = useRouter();

  const [selectedPath, setSelectedPath] = useState<CreationPath>("blank");
  const [name, setName] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setSelectedPath("blank");
    setName("");
    setAiPrompt("");
    setSelectedTemplate(null);
    setCreating(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const canCreate =
    name.trim().length > 0 &&
    (selectedPath !== "ai" || aiPrompt.trim().length > 0) &&
    (selectedPath !== "template" || selectedTemplate !== null);

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;
    setCreating(true);
    setError(null);

    try {
      // Step 1: Create the scenario
      const res = await apiFetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          source: selectedPath === "template" ? "template" : selectedPath,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to create scenario (${res.status})`);
      }

      const scenario = await res.json();

      // Step 2: If AI or template, send the prompt to chat
      if (selectedPath === "ai" || selectedPath === "template") {
        const prompt =
          selectedPath === "ai"
            ? aiPrompt.trim()
            : TEMPLATES.find((t) => t.id === selectedTemplate)?.prompt ?? "";

        if (prompt) {
          // Fire and forget — the AI will process in background via SSE
          // We don't need to wait for the full response to close the modal
          apiFetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: prompt,
              scenarioId: scenario.id,
            }),
          }).catch(() => {
            // Best-effort: chat failure shouldn't block scenario creation
          });
        }
      }

      // Step 3: Close modal, refresh, notify parent
      handleClose();
      router.refresh();
      onCreated?.({ id: scenario.id, name: scenario.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setCreating(false);
    }
  }, [canCreate, name, selectedPath, aiPrompt, selectedTemplate, handleClose, router, onCreated]);

  return (
    <Modal open={open} onClose={handleClose} title="Create Scenario" size="xl">
      <p className="text-sm text-surface-500 mb-5">
        Choose how you want to start your new scenario.
      </p>

      {/* Path cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {PATH_CARDS.map(({ path, icon: Icon, title, description, accent }) => {
          const isSelected = selectedPath === path;
          return (
            <button
              key={path}
              type="button"
              onClick={() => setSelectedPath(path)}
              className={`
                relative rounded-xl border-2 p-4 text-left transition-all
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2
                ${
                  isSelected
                    ? accent
                      ? "border-accent-500 bg-accent-50"
                      : "border-brand-500 bg-brand-50"
                    : "border-surface-200 bg-surface-0 hover:border-surface-300 hover:bg-surface-50"
                }
              `}
            >
              <div
                className={`mb-2 inline-flex items-center justify-center rounded-lg p-2 ${
                  accent
                    ? isSelected
                      ? "bg-accent-100 text-accent-600"
                      : "bg-accent-50 text-accent-500"
                    : isSelected
                      ? "bg-brand-100 text-brand-600"
                      : "bg-surface-100 text-surface-500"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-sm font-semibold text-surface-900">{title}</div>
              <div className="mt-0.5 text-xs text-surface-500 leading-relaxed">{description}</div>
            </button>
          );
        })}
      </div>

      {/* AI prompt textarea — shown when "Ask AI" is selected */}
      {selectedPath === "ai" && (
        <div className="mb-5 animate-slide-up">
          <label
            htmlFor="ai-prompt"
            className="block text-sm font-medium text-surface-700 mb-2"
          >
            What do you want to explore?
          </label>
          <textarea
            id="ai-prompt"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="e.g. What happens if we delay hiring by 3 months and cut marketing by 30%?"
            rows={3}
            className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all resize-none"
          />
        </div>
      )}

      {/* Template picker — shown when "Template" is selected */}
      {selectedPath === "template" && (
        <div className="mb-5 animate-slide-up">
          <label className="block text-sm font-medium text-surface-700 mb-2">
            Choose a template
          </label>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTemplate(t.id)}
                className={`rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-all
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1
                  ${
                    selectedTemplate === t.id
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-surface-200 bg-surface-0 text-surface-700 hover:border-surface-300 hover:bg-surface-50"
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Name input */}
      <div className="mb-5">
        <FormField
          label="Scenario name"
          placeholder="e.g. Best Case Q3"
          value={name}
          onChange={setName}
          validate={(v) => (v.trim().length === 0 ? "Name is required" : null)}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3 text-sm text-danger-700" role="alert">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" onClick={handleClose} disabled={creating}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleCreate}
          disabled={!canCreate}
          state={creating ? "loading" : "idle"}
          icon={<Sparkles className="h-4 w-4" />}
        >
          Create Scenario
        </Button>
      </div>
    </Modal>
  );
}
