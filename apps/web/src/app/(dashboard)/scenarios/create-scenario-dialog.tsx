"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Target,
  Rocket,
  Users,
  DollarSign,
  Sparkles,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";

interface Template {
  name: string;
  type: "base" | "best" | "worst" | "custom";
  description: string;
  icon: typeof TrendingUp;
  color: string;
}

const templates: Template[] = [
  {
    name: "Best Case",
    type: "best",
    description: "Optimistic projections — higher revenue growth, lower churn, faster hiring",
    icon: TrendingUp,
    color: "text-success-600 bg-success-50",
  },
  {
    name: "Worst Case",
    type: "worst",
    description: "Conservative projections — slower growth, higher costs, delayed revenue",
    icon: TrendingDown,
    color: "text-danger-600 bg-danger-50",
  },
  {
    name: "Fundraise Scenario",
    type: "custom",
    description: "Model a funding round — new capital, dilution, accelerated hiring",
    icon: DollarSign,
    color: "text-brand-600 bg-brand-50",
  },
  {
    name: "Growth Acceleration",
    type: "custom",
    description: "Double down on growth — more marketing spend, faster customer acquisition",
    icon: Rocket,
    color: "text-violet-600 bg-violet-50",
  },
  {
    name: "Lean Operations",
    type: "custom",
    description: "Extend runway — reduce hiring, cut discretionary spend, focus on profitability",
    icon: Target,
    color: "text-amber-600 bg-amber-50",
  },
  {
    name: "Hiring Plan",
    type: "custom",
    description: "Model different team sizes — impact on burn rate, runway, and output",
    icon: Users,
    color: "text-sky-600 bg-sky-50",
  },
];

export function CreateScenarioDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [customName, setCustomName] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const createScenario = async (name: string, type: string, description: string) => {
    setCreating(true);
    try {
      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, description }),
      });
      if (!res.ok) throw new Error("Failed to create scenario");
      const scenario = await res.json();
      setOpen(false);
      router.refresh();
      router.push(`/scenarios/${scenario.id}`);
    } catch {
      // Error is handled implicitly — user sees no navigation
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setShowCustom(false);
          setCustomName("");
        }}
        className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
      >
        <Plus className="h-4 w-4" />
        New Scenario
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Create Scenario" size="lg">
        {showCustom ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Scenario Name
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g., Q3 Expansion Plan"
                className="w-full rounded-xl border border-surface-300 bg-surface-0 px-3.5 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowCustom(false)}
                className="flex-1 rounded-xl border border-surface-300 px-4 py-2.5 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => customName.trim() && createScenario(customName.trim(), "custom", "")}
                disabled={!customName.trim() || creating}
                className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-surface-500 mb-4">
              Start from a template or create a blank scenario.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {templates.map((template) => {
                const Icon = template.icon;
                return (
                  <button
                    key={template.name}
                    onClick={() =>
                      createScenario(template.name, template.type, template.description)
                    }
                    disabled={creating}
                    className="text-left rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all group disabled:opacity-50"
                  >
                    <div className={`inline-flex rounded-lg p-2 ${template.color} mb-2`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <h4 className="text-sm font-semibold text-surface-900 group-hover:text-brand-700 transition-colors">
                      {template.name}
                    </h4>
                    <p className="mt-0.5 text-xs text-surface-500 line-clamp-2">
                      {template.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-surface-100 pt-3 flex items-center gap-3">
              <button
                onClick={() => setShowCustom(true)}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-dashed border-surface-300 px-4 py-3 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 transition-colors"
              >
                <Sparkles className="h-4 w-4" />
                Blank Scenario
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
