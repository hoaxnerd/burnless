"use client";

import { useEffect, useMemo } from "react";
import { captureException } from "@/lib/error-reporting";
import { RefreshCw, WifiOff, Clock, AlertTriangle } from "lucide-react";

function classifyPageError(error: Error): {
  icon: typeof AlertTriangle;
  title: string;
  message: string;
} {
  const msg = error.message.toLowerCase();

  if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")) {
    return {
      icon: WifiOff,
      title: "Connection issue",
      message: "Could not reach the server. Check your internet connection and try again.",
    };
  }
  if (msg.includes("timeout") || msg.includes("aborted")) {
    return {
      icon: Clock,
      title: "Request timed out",
      message: "The page took too long to load. This usually resolves on its own — try again.",
    };
  }
  return {
    icon: AlertTriangle,
    title: "Something went wrong",
    message: "We hit an unexpected error loading this page. This has been logged automatically.",
  };
}

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  const { icon: Icon, title, message } = useMemo(() => classifyPageError(error), [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-12 text-center max-w-md animate-scale-in">
        <div className="inline-flex items-center justify-center rounded-2xl bg-danger-500/10 p-4 mb-5">
          <Icon className="h-8 w-8 text-danger-500" />
        </div>
        <h3 className="text-xl font-bold text-surface-900 mb-2">{title}</h3>
        <p className="text-sm text-surface-500 mb-6">{message}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
          <a
            href="/dashboard"
            className="rounded-xl bg-surface-100 px-5 py-2.5 text-sm font-semibold text-surface-700 hover:bg-surface-200 transition-colors"
          >
            Go to dashboard
          </a>
        </div>
        {process.env.NODE_ENV === "development" && (
          <details className="mt-6 text-left">
            <summary className="text-xs text-surface-400 cursor-pointer">Error details</summary>
            <pre className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg p-3 overflow-auto max-h-48">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
