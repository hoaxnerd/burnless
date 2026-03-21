import { RefObject } from "react";
import { SocialLoginButtons } from "./social-login-buttons";

interface EmailStepProps {
  email: string;
  onEmailChange: (email: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isChecking: boolean;
  emailRef: RefObject<HTMLInputElement | null>;
}

export function EmailStep({
  email,
  onEmailChange,
  onSubmit,
  isChecking,
  emailRef,
}: EmailStepProps) {
  return (
    <div style={{ animation: "fadeSlideIn 300ms ease-out" }}>
      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-surface-700 mb-2"
          >
            Email address
          </label>
          <input
            ref={emailRef}
            id="email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="you@startup.com"
            required
            autoFocus
            className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={isChecking || !email}
          className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 transition-all duration-200 shadow-sm shadow-brand-600/20 hover:shadow-md hover:shadow-brand-600/25"
        >
          {isChecking ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Checking...
            </span>
          ) : (
            "Continue"
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="relative my-7">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-surface-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-surface-0 px-3 text-surface-400 font-medium tracking-wide">
            Or continue with
          </span>
        </div>
      </div>

      {/* Social auth */}
      <SocialLoginButtons />
    </div>
  );
}
