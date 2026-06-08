import { useRef, useEffect } from "react";
import { User, ArrowRight, SkipForward } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Input } from "@/components/ui";

/**
 * Name-prompt fallback (founder decision #3).
 *
 * The user's name primarily comes from the AI onboarding agent (suggested
 * founders). When the user SKIPS the AI flow — or the agent FAILS and never
 * surfaces a founder — there is no name to attach. This step gives the user an
 * explicit chance to provide one before the company is created, so they always
 * end with a real name rather than the email-localpart fallback the register
 * route sets.
 *
 * The name itself stays OPTIONAL — "Continue without a name" proceeds and the
 * server keeps the existing (register-derived) name.
 */
interface NameFallbackStepProps {
  name: string;
  onNameChange: (next: string) => void;
  onContinue: () => void;
  onSkip: () => void;
}

export function NameFallbackStep({
  name,
  onNameChange,
  onContinue,
  onSkip,
}: NameFallbackStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onContinue();
  };

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center animate-slide-up">
        <BrandLogo className="h-14 w-14 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-surface-900 dark:text-surface-50">
          One last thing
        </h1>
        <p className="mt-3 text-surface-500 dark:text-surface-400 max-w-sm mx-auto">
          What should we call you? This personalizes your dashboard.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 text-left">
          <label
            htmlFor="onboarding-your-name"
            className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5"
          >
            Your name
          </label>
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400 z-10" />
            <Input
              ref={inputRef}
              id="onboarding-your-name"
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="E.g. Jane Doe"
              className="rounded-2xl pl-12 pr-4 py-4 text-base"
            />
          </div>
          <button
            type="submit"
            disabled={!name.trim()}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-4 text-base font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>

        <button
          onClick={onSkip}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-800 px-6 py-3.5 text-base font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
        >
          <SkipForward className="w-4 h-4" />
          Continue without a name
        </button>
      </div>
    </div>
  );
}
