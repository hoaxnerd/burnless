"use client";

import { useEffect } from "react";
import { captureException } from "@/lib/error-reporting";

export default function AppError({
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
    <div className="flex items-center justify-center min-h-screen bg-surface-50">
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-12 text-center max-w-md">
        <div className="inline-flex items-center justify-center rounded-2xl bg-red-500/10 p-4 mb-5">
          <svg
            className="h-8 w-8 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-surface-900 mb-2">Something went wrong</h3>
        <p className="text-sm text-surface-500 mb-6">
          We hit an unexpected error. Please try refreshing the page.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Try again
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="rounded-xl bg-surface-100 px-5 py-2.5 text-sm font-semibold text-surface-700 hover:bg-surface-200 transition-colors"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
