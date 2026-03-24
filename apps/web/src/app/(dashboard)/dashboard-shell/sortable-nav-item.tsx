"use client";

import Link from "next/link";
import { GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { NavItem } from "./nav-config";

export function SortableNavItem({
  item,
  isActive,
  href,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  href: string;
  collapsed: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = item.icon;
  const isAi = item.id === "ai";

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <Link
        href={href}
        className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
          isAi
            ? isActive
              ? "bg-gradient-to-r from-accent-500/15 to-accent-400/10 text-accent-700 shadow-sm border border-accent-500/20"
              : "bg-gradient-to-r from-accent-500/[0.06] to-transparent text-accent-600 hover:from-accent-500/10 hover:to-accent-400/[0.06] border border-accent-500/10 hover:border-accent-500/20"
            : isActive
              ? "bg-brand-50 text-brand-700 shadow-sm"
              : "text-surface-600 hover:bg-surface-50 hover:text-surface-900"
        } ${collapsed ? "justify-center px-2" : ""}`}
        aria-current={isActive ? "page" : undefined}
        title={collapsed ? item.label : undefined}
      >
        <Icon className={`h-4 w-4 flex-shrink-0 ${isAi ? "text-accent-500" : isActive ? "text-brand-600" : "text-surface-400"}`} />
        {!collapsed && <span className="flex-1">{item.label}</span>}
      </Link>
      {/* Drag handle — only visible on hover, only when expanded */}
      {!collapsed && (
        <button
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-100 text-surface-300 hover:text-surface-500 transition-all cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${item.label}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
