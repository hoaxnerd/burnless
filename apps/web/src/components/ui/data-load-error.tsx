"use client";

import { RefreshCw, WifiOff, Clock, AlertTriangle } from "lucide-react";

export type ErrorVariant = "network" | "timeout" | "server" | "generic";

interface DataLoadErrorProps {
  /** Short title for the error card */
  title?: string;
  /** User-friendly message explaining what happened */
  message?: string;
  /** Retry callback — shows retry button when provided */
  onRetry?: () => void;
  /** Whether a retry is currently in progress */
  retrying?: boolean;
  /** Error variant to auto-select icon and default message */
  variant?: ErrorVariant;
  /** Compact inline style vs full card style */
  compact?: boolean;
}

const variantConfig: Record<ErrorVariant, { icon: typeof AlertTriangle; defaultMessage: string }> = {
  network: {
    icon: WifiOff,
    defaultMessage: "Could not reach the server. Check your connection and try again.",
  },
  timeout: {
    icon: Clock,
    defaultMessage: "This is taking longer than expected. Please try again.",
  },
  server: {
    icon: AlertTriangle,
    defaultMessage: "Something went wrong on our end. We've been notified and are looking into it.",
  },
  generic: {
    icon: AlertTriangle,
    defaultMessage: "Something went wrong loading this data.",
  },
};

/** Classify an error into a variant for appropriate UX */
export function classifyError(error: unknown): ErrorVariant {
  if (error instanceof TypeError && error.message.includes("fetch")) return "network";
  if (error instanceof DOMException && error.name === "AbortError") return "timeout";
  if (error instanceof Error && error.message.toLowerCase().includes("timeout")) return "timeout";
  if (error instanceof Error && error.message.toLowerCase().includes("network")) return "network";
  if (error instanceof Response && error.status >= 500) return "server";
  return "generic";
}

export function DataLoadError({
  title = "Failed to load",
  message,
  onRetry,
  retrying = false,
  variant = "generic",
  compact = false,
}: DataLoadErrorProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;
  const displayMessage = message || config.defaultMessage;

  if (compact) {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border border-surface-200 bg-surface-0 px-4 py-3"
        role="alert"
      >
        <Icon className="h-4 w-4 text-danger-500 flex-shrink-0" />
        <p className="text-sm text-surface-600 flex-1">{displayMessage}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={retrying}
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Retrying..." : "Retry"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-surface-200 bg-surface-0 p-8 text-center"
      role="alert"
    >
      <div className="inline-flex items-center justify-center rounded-2xl bg-danger-500/10 p-3 mb-4">
        <Icon className="h-6 w-6 text-danger-500" />
      </div>
      <h3 className="text-sm font-semibold text-surface-900 mb-1">{title}</h3>
      <p className="text-xs text-surface-500 mb-4 max-w-sm mx-auto">{displayMessage}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 rounded-xl border border-surface-200 px-4 py-2 text-sm font-medium text-surface-600 hover:bg-surface-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
          {retrying ? "Retrying..." : "Try again"}
        </button>
      )}
    </div>
  );
}
