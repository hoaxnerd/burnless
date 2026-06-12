"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * CategorySection — the collapsible labelled section shell shared by all three
 * Tool categories (Connectors / Web / Workspace). Mockup token: `.cathd`
 * (uppercase surface-400 label, optional right-aligned count, leading chevron)
 * + a body that hides when collapsed.
 *
 * Collapse state is LOCAL UI only (S3b §2) — `useState`, never persisted.
 */
export interface CategorySectionProps {
  label: string;
  /** Optional right-aligned count text (e.g. "3" or "built-in"). */
  count?: ReactNode;
  /** Start collapsed? Default expanded. */
  defaultCollapsed?: boolean;
  children: ReactNode;
}

export function CategorySection({
  label,
  count,
  defaultCollapsed = false,
  children,
}: CategorySectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <div className="mb-1">
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-[7px] px-0.5 pt-[9px] pb-[7px]"
      >
        <Chevron className="h-[13px] w-[13px] flex-none text-surface-400" />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-surface-400">
          {label}
        </span>
        {count != null && (
          <span className="ml-auto text-[10.5px] tabular-nums text-surface-400">
            {count}
          </span>
        )}
      </button>
      {!collapsed && children}
    </div>
  );
}
