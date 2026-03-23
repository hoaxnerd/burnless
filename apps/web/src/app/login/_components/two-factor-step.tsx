"use client";

import { useRef, useEffect } from "react";

interface TwoFactorStepProps {
  totpCode: string;
  onTotpCodeChange: (code: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  isLoading: boolean;
  email: string;
}

export function TwoFactorStep({
  totpCode,
  onTotpCodeChange,
  onSubmit,
  onBack,
  isLoading,
  email,
}: TwoFactorStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <p className="text-sm text-surface-600 mb-4">
          Enter the 6-digit code from your authenticator app for{" "}
          <span className="font-medium text-surface-800">{email}</span>.
        </p>
        <label htmlFor="totp-code" className="block text-sm font-medium text-surface-700 mb-1.5">
          Verification code
        </label>
        <input
          ref={inputRef}
          id="totp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          value={totpCode}
          onChange={(e) => {
            const v = e.target.value.replace(/[^a-fA-F0-9]/g, "");
            onTotpCodeChange(v);
          }}
          placeholder="000000"
          className="w-full rounded-xl border border-surface-200 bg-surface-0 px-4 py-3 text-center text-lg font-mono tracking-[0.3em] text-surface-900 placeholder:text-surface-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
        />
        <p className="mt-2 text-xs text-surface-400">
          You can also use a backup code.
        </p>
      </div>

      <button
        type="submit"
        disabled={isLoading || totpCode.length < 6}
        className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Verifying...
          </span>
        ) : (
          "Verify"
        )}
      </button>

      <button
        type="button"
        onClick={onBack}
        className="w-full text-sm text-surface-500 hover:text-surface-700 transition-colors py-2"
      >
        Back to sign in
      </button>
    </form>
  );
}
