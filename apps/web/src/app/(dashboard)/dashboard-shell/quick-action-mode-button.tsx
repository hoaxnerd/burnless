"use client";

import { useState, useEffect, useRef } from "react";
import { Settings, Brain, Activity, Pin, type LucideIcon } from "lucide-react";

import type { QuickActionMode } from "./nav-config";

const modeConfig: Array<{ value: QuickActionMode; label: string; icon: LucideIcon }> = [
  { value: "intelligence", label: "Intelligence", icon: Brain },
  { value: "dynamic", label: "Dynamic", icon: Activity },
  { value: "custom", label: "Custom", icon: Pin },
];

export function QuickActionModeButton({
  actionId,
  currentMode,
  isOverride,
  aiEnabled,
  onModeChange,
}: {
  actionId: string;
  currentMode: QuickActionMode;
  isOverride: boolean;
  aiEnabled: boolean;
  onModeChange: (actionId: string, mode: QuickActionMode | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((p) => !p);
        }}
        className={`p-0.5 rounded transition-all ${
          open
            ? "opacity-100 text-surface-500"
            : "opacity-0 group-hover/qa:opacity-100 text-surface-300 hover:text-surface-500"
        }`}
        title="Action mode"
        aria-label="Action mode settings"
      >
        <Settings className="h-3 w-3" />
      </button>

      {open && (
        <div
          className="absolute z-50 bottom-full mb-1 right-0 w-36 rounded-lg bg-surface-0 border border-surface-200 shadow-lg py-1 animate-scale-in origin-bottom-right"
          role="menu"
        >
          {modeConfig.map((m) => {
            const Icon = m.icon;
            const isActive = currentMode === m.value;
            const isDisabled = m.value === "intelligence" && !aiEnabled;
            return (
              <button
                key={m.value}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!isDisabled) {
                    onModeChange(actionId, m.value);
                    setOpen(false);
                  }
                }}
                disabled={isDisabled}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700 font-medium"
                    : isDisabled
                      ? "text-surface-300 cursor-not-allowed"
                      : "text-surface-600 hover:bg-surface-50"
                }`}
                role="menuitem"
              >
                <Icon className="h-3 w-3" />
                <span>{m.label}</span>
              </button>
            );
          })}
          {isOverride && (
            <>
              <div className="border-t border-surface-100 my-0.5" />
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onModeChange(actionId, null);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-50 transition-colors"
                role="menuitem"
              >
                <span>Reset</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
