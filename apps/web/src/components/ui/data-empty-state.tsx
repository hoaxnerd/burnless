import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * DataEmptyState — a generic, content-agnostic zero-data view [ESL-1].
 *
 * Unlike `PageEmptyState` (which is route-specific and CTA-link driven), this is
 * the low-level landing pad for "this list/section has no rows yet". It accepts a
 * free-form `action` (button, link, anything) so it can sit inside `AsyncData`
 * and inline list views alike.
 */

export interface DataEmptyStateProps {
  /** Heading. */
  title: string;
  /** Supporting copy (string or node). */
  body?: ReactNode;
  /** Icon to display (defaults to an inbox). */
  icon?: LucideIcon;
  /** Optional action node (button, link, etc.). */
  action?: ReactNode;
  /** Compact inline style vs full card style. */
  compact?: boolean;
  className?: string;
}

/**
 * isEmpty — the canonical "no data" predicate for `DataEmptyState` / `AsyncData`.
 * Treats null/undefined, empty arrays, empty strings, and `{}` as empty.
 */
export function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim().length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

export function DataEmptyState({
  title,
  body,
  icon: Icon = Inbox,
  action,
  compact = false,
  className = "",
}: DataEmptyStateProps) {
  if (compact) {
    return (
      <div
        className={`flex items-center gap-3 rounded-xl border border-surface-200 bg-surface-0 px-4 py-3 dark:bg-surface-900 dark:border-surface-700 ${className}`}
      >
        <Icon className="h-4 w-4 flex-shrink-0 text-surface-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-surface-700 dark:text-surface-200">
            {title}
          </p>
          {body && (
            <p className="text-xs text-surface-500 dark:text-surface-400">{body}</p>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-surface-200 bg-surface-0 p-8 text-center dark:bg-surface-900 dark:border-surface-700 ${className}`}
    >
      <div className="inline-flex items-center justify-center rounded-2xl bg-surface-100 p-3 mb-4 dark:bg-surface-800">
        <Icon className="h-6 w-6 text-surface-400" />
      </div>
      <h3 className="text-sm font-semibold text-surface-900 mb-1 dark:text-surface-50">
        {title}
      </h3>
      {body && (
        <p className="text-xs text-surface-500 mb-4 max-w-sm mx-auto dark:text-surface-400">
          {body}
        </p>
      )}
      {action && <div className="mt-2 flex justify-center">{action}</div>}
    </div>
  );
}
