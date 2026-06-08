import { RefObject } from "react";
import { Globe, Sparkles, SkipForward } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Input } from "@/components/ui";

interface WebsiteStepProps {
  websiteUrl: string;
  onWebsiteUrlChange: (url: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onSkipToForm: () => void;
  onSkipOnboarding: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function WebsiteStep({
  websiteUrl,
  onWebsiteUrlChange,
  onSubmit,
  onSkipToForm,
  onSkipOnboarding,
  inputRef,
}: WebsiteStepProps) {
  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center animate-slide-up">
        {/* Progress indicator */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-8 rounded-full bg-brand-600" />
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

        <BrandLogo className="h-14 w-14 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-surface-900 dark:text-surface-50">
          Welcome to burnless
        </h1>
        <p className="mt-3 text-surface-500 dark:text-surface-400 max-w-sm mx-auto">
          Enter your company website and we&apos;ll set everything up for you.
        </p>

        <form onSubmit={onSubmit} className="mt-8">
          <div className="relative">
            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400 z-10" />
            <Input
              ref={inputRef}
              aria-label="Company website"
              type="text"
              value={websiteUrl}
              onChange={(e) => onWebsiteUrlChange(e.target.value)}
              placeholder="yourcompany.com"
              className="rounded-2xl pl-12 pr-4 py-4 text-base"
            />
          </div>
          <button
            type="submit"
            disabled={!websiteUrl.trim()}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-4 text-base font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-5 h-5" />
            Set Up My Company
          </button>
        </form>

        <button
          onClick={onSkipToForm}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-800 px-6 py-3.5 text-base font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
        >
          <SkipForward className="w-4 h-4" />
          I&apos;ll fill in manually
        </button>
        <p className="mt-2 text-center text-xs text-surface-400">
          You can always update this later in Settings
        </p>
      </div>
    </div>
  );
}
