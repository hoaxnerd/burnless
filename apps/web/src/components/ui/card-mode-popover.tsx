"use client";

/**
 * CardModePopover — per-card/per-widget mode selector.
 * Shows a settings gear on hover; clicking opens a popover to choose
 * Intelligence / Dynamic / Custom mode for that specific card.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Settings, Brain, Zap, SlidersHorizontal, RotateCcw } from "lucide-react";

export type CardMode = "intelligence" | "dynamic" | "custom";

const MODES: Array<{
  value: CardMode;
  label: string;
  icon: typeof Brain;
  description: string;
}> = [
  {
    value: "intelligence",
    label: "Intelligence",
    icon: Brain,
    description: "AI decides what to show",
  },
  {
    value: "dynamic",
    label: "Dynamic",
    icon: Zap,
    description: "Data-driven defaults",
  },
  {
    value: "custom",
    label: "Custom",
    icon: SlidersHorizontal,
    description: "Your configuration",
  },
];

interface CardModePopoverProps {
  /** Current effective mode for this card */
  currentMode: CardMode;
  /** Called when user picks a mode (null = reset to default) */
  onModeChange: (mode: CardMode | null) => void;
  /** Whether this card has a per-card override (vs inheriting default) */
  isOverride?: boolean;
  /** Whether AI features are enabled */
  aiEnabled?: boolean;
  /** Position bias for the popover */
  align?: "left" | "right";
}

export function CardModePopover({
  currentMode,
  onModeChange,
  isOverride = false,
  aiEnabled = false,
  align = "right",
}: CardModePopoverProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setHovered(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setHovered(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const handleSelect = useCallback(
    (mode: CardMode) => {
      onModeChange(mode);
      setOpen(false);
    },
    [onModeChange]
  );

  const handleReset = useCallback(() => {
    onModeChange(null);
    setOpen(false);
  }, [onModeChange]);

  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { if (!open) setHovered(false); }}
    >
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((prev) => !prev);
        }}
        className={`
          p-1.5 rounded-full transition-all duration-200 shadow-sm border
          ${open || hovered
            ? "opacity-100 bg-surface-0 border-surface-300 text-surface-600 scale-100"
            : "opacity-0 scale-90 bg-surface-0 border-surface-200 text-surface-300"
          }
        `}
        title="Card mode settings"
        aria-label="Card mode settings"
        aria-expanded={open}
      >
        <Settings className="h-3 w-3" />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className={`
            absolute z-50 top-full mt-1
            ${align === "right" ? "right-0" : "left-0"}
            w-48 rounded-xl bg-surface-0 border border-surface-200
            shadow-lg shadow-black/5 py-1
            animate-scale-in origin-top-right
          `}
          role="menu"
        >
          <div className="px-3 py-1.5 border-b border-surface-100">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-400">
              Card Mode
            </span>
          </div>

          {MODES.map((m) => {
            const Icon = m.icon;
            const isActive = currentMode === m.value;
            const isDisabled = m.value === "intelligence" && !aiEnabled;

            return (
              <button
                key={m.value}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isDisabled) handleSelect(m.value);
                }}
                disabled={isDisabled}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors
                  ${isActive
                    ? "bg-brand-50 text-brand-700"
                    : isDisabled
                      ? "text-surface-300 cursor-not-allowed"
                      : "text-surface-600 hover:bg-surface-50 hover:text-surface-900"
                  }
                `}
                role="menuitem"
              >
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? "text-brand-600" : ""}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium block">{m.label}</span>
                  <span className="text-[10px] text-surface-400 block">
                    {isDisabled ? "Requires AI" : m.description}
                  </span>
                </div>
                {isActive && (
                  <div className="h-1.5 w-1.5 rounded-full bg-brand-500 flex-shrink-0" />
                )}
              </button>
            );
          })}

          {isOverride && (
            <>
              <div className="border-t border-surface-100 my-1" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleReset();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-surface-500 hover:bg-surface-50 hover:text-surface-700 transition-colors"
                role="menuitem"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset to default</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
