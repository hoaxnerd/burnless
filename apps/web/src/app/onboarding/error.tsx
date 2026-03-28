"use client";

import { useEffect } from "react";
import { captureException } from "@/lib/error-reporting";
import { RefreshCw, AlertTriangle } from "lucide-react";

export default function OnboardingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { captureException(error); }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-50 dark:bg-surface-950">
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-12 text-center max-w-md">
        <div className="inline-flex items-center justify-center rounded-2xl bg-danger-500/10 p-4 mb-5">
          <AlertTriangle className="h-8 w-8 text-danger-500" />
        </div>
        <h3 className="text-xl font-bold text-surface-900 mb-2">Something went wrong</h3>
        <p className="text-sm text-surface-500 mb-6">We hit an unexpected error during onboarding.</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
          <a
            href="/login"
            className="rounded-xl bg-surface-100 px-5 py-2.5 text-sm font-semibold text-surface-700 hover:bg-surface-200 transition-colors"
          >
            Back to login
          </a>
        </div>
      </div>
    </div>
  );
}
