/**
 * ScenarioBadge — small status badge for override states and scenario metadata.
 *
 * Uses the Burnless semantic color tokens (warning, success, danger, accent, surface)
 * defined in globals.css. All dark-mode variants rely on the CSS-variable overrides
 * that the design system already provides.
 */

interface ScenarioBadgeProps {
  variant: "modified" | "created" | "deleted" | "source" | "status";
  /** Required when variant is "source" or "status" */
  value?: string;
}

const BASE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

function getOverrideBadge(variant: "modified" | "created" | "deleted") {
  switch (variant) {
    case "modified":
      return {
        className: `${BASE} bg-warning-100 text-warning-700`,
        label: "Modified",
      };
    case "created":
      return {
        className: `${BASE} bg-success-100 text-success-700`,
        label: "Scenario Only",
      };
    case "deleted":
      return {
        className: `${BASE} bg-danger-100 text-danger-700`,
        label: "Hidden in Scenario",
      };
  }
}

function getSourceBadge(value: string | undefined) {
  switch (value) {
    case "ai":
      return { className: `${BASE} bg-accent-100 text-accent-700`, label: "AI" };
    case "template":
      return { className: `${BASE} bg-accent-100 text-accent-700`, label: "Template" };
    case "blank":
      return { className: `${BASE} bg-surface-100 text-surface-600`, label: "Blank" };
    case "clone":
      return { className: `${BASE} bg-surface-100 text-surface-600`, label: "Clone" };
    case "backup":
      return { className: `${BASE} bg-warning-100 text-warning-700`, label: "Backup" };
    default:
      return { className: `${BASE} bg-surface-100 text-surface-600`, label: value ?? "Unknown" };
  }
}

function getStatusBadge(value: string | undefined) {
  switch (value) {
    case "active":
      return { className: `${BASE} bg-success-100 text-success-700`, label: "Active" };
    case "promoted":
      return { className: `${BASE} bg-accent-100 text-accent-700`, label: "Promoted" };
    case "archived":
      return { className: `${BASE} bg-surface-100 text-surface-600`, label: "Archived" };
    default:
      return { className: `${BASE} bg-surface-100 text-surface-600`, label: value ?? "Unknown" };
  }
}

export function ScenarioBadge({ variant, value }: ScenarioBadgeProps) {
  let badge: { className: string; label: string };

  if (variant === "source") {
    badge = getSourceBadge(value);
  } else if (variant === "status") {
    badge = getStatusBadge(value);
  } else {
    badge = getOverrideBadge(variant);
  }

  return <span className={badge.className}>{badge.label}</span>;
}
