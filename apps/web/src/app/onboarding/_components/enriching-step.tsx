import { useEffect, useState } from "react";
import { Sparkles, SkipForward } from "lucide-react";
import { DEFAULTS } from "./constants";

const ENRICHMENT_TIMEOUT_SECS = 120;

interface EnrichingStepProps {
  greeting: string;
  websiteUrl: string;
  enrichedCount: number;
  onSkipToForm: () => void;
  onSkipOnboarding: () => void;
}

export function EnrichingStep({
  greeting,
  websiteUrl,
  enrichedCount,
  onSkipToForm,
  onSkipOnboarding,
}: EnrichingStepProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (elapsed >= ENRICHMENT_TIMEOUT_SECS) {
      onSkipToForm();
    }
  }, [elapsed, onSkipToForm]);

  const remaining = ENRICHMENT_TIMEOUT_SECS - elapsed;

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center animate-fade-in">
        {/* Progress indicator */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-8 rounded-full bg-brand-600 animate-pulse" />
              <div className="h-2 w-8 rounded-full bg-surface-200 dark:bg-surface-700" />
              <div className="h-2 w-8 rounded-full bg-surface-200 dark:bg-surface-700" />
            </div>
            <span className="text-xs font-medium text-surface-500 dark:text-surface-400">
              Step 1 of 3
            </span>
          </div>
          <button
            onClick={onSkipOnboarding}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Skip all
          </button>
        </div>

        <div className="relative mx-auto mb-6">
          <div className="h-14 w-14 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto shadow-lg">
            <Sparkles className="w-7 h-7 text-white animate-pulse" />
          </div>
        </div>
        <h2 className="text-xl font-semibold text-surface-900 dark:text-surface-50">
          {greeting}
        </h2>
        <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
          Analyzing {websiteUrl}
        </p>

        {/* Progress dots */}
        <div className="mt-8 flex justify-center gap-2">
          {Object.keys(DEFAULTS).map((_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full transition-all duration-500 ${
                i < enrichedCount
                  ? "bg-brand-600 scale-100"
                  : "bg-surface-200 dark:bg-surface-700 scale-75"
              }`}
            />
          ))}
        </div>

        <p className="mt-4 text-xs text-surface-400">
          {enrichedCount > 0
            ? `Found ${enrichedCount} field${enrichedCount !== 1 ? "s" : ""}`
            : "Searching..."}
        </p>

        {remaining <= 15 && remaining > 0 && (
          <p className="mt-2 text-xs text-surface-400">
            Moving to manual entry in {remaining}s&hellip;
          </p>
        )}

        <button
          onClick={onSkipToForm}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-surface-300 dark:border-surface-600 px-5 py-2.5 text-sm font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
        >
          <SkipForward className="w-4 h-4" />
          Skip — I&apos;ll fill in manually
        </button>
        <button
          onClick={onSkipOnboarding}
          className="mt-3 inline-flex items-center justify-center gap-1.5 text-sm font-medium text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
        >
          Skip all — go to dashboard
        </button>
      </div>
    </div>
  );
}
