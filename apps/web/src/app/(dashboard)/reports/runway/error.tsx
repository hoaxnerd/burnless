"use client";

import { useEffect } from "react";
import { captureException } from "@/lib/error-reporting";
import { DataLoadError, classifyError } from "@/components/ui/data-load-error";

export default function RunwayError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <DataLoadError
        title="Failed to load Runway"
        variant={classifyError(error)}
        onRetry={reset}
      />
      <a
        href="/reports"
        className="text-sm text-surface-500 hover:text-surface-700 transition-colors"
      >
        Back to Reports
      </a>
      {process.env.NODE_ENV === "development" && (
        <details className="w-full max-w-md">
          <summary className="text-xs text-surface-400 cursor-pointer">Error details</summary>
          <pre className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg p-3 overflow-auto max-h-48">
            {error.message}
            {error.stack && `\n\n${error.stack}`}
          </pre>
        </details>
      )}
    </div>
  );
}
