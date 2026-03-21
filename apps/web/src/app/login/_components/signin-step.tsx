import { RefObject } from "react";
import Link from "next/link";

interface SignInStepProps {
  email: string;
  password: string;
  onPasswordChange: (password: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  isLoading: boolean;
  passwordRef: RefObject<HTMLInputElement | null>;
}

export function SignInStep({
  email,
  password,
  onPasswordChange,
  onSubmit,
  onBack,
  isLoading,
  passwordRef,
}: SignInStepProps) {
  return (
    <div style={{ animation: "fadeSlideIn 300ms ease-out" }}>
      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-surface-700"
            >
              Password
            </label>
          </div>
          <input
            ref={passwordRef}
            id="password"
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="Enter your password"
            required
            minLength={8}
            className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 transition-all duration-200 shadow-sm shadow-brand-600/20 hover:shadow-md hover:shadow-brand-600/25"
        >
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Signing in...
            </span>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-surface-500 hover:text-brand-600 transition-colors font-medium py-2"
        >
          &larr; Different email
        </button>
        <Link
          href={`/reset-password?email=${encodeURIComponent(email)}`}
          className="text-sm text-surface-500 hover:text-brand-600 transition-colors font-medium py-2"
        >
          Forgot password?
        </Link>
      </div>
    </div>
  );
}
