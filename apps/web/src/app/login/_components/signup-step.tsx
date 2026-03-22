import { RefObject } from "react";
import { PasswordStrength } from "./password-strength";
import type { PasswordStrength as PasswordStrengthType } from "./types";

interface SignUpStepProps {
  name: string;
  onNameChange: (name: string) => void;
  password: string;
  onPasswordChange: (password: string) => void;
  inviteCode: string;
  onInviteCodeChange: (code: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  isLoading: boolean;
  passwordStrength: PasswordStrengthType;
  passwordRef: RefObject<HTMLInputElement | null>;
}

export function SignUpStep({
  name,
  onNameChange,
  password,
  onPasswordChange,
  inviteCode,
  onInviteCodeChange,
  onSubmit,
  onBack,
  isLoading,
  passwordStrength,
  passwordRef,
}: SignUpStepProps) {
  return (
    <div style={{ animation: "fadeSlideIn 300ms ease-out" }}>
      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-surface-700 mb-2"
          >
            Your name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Jane Doe"
            className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
          />
        </div>
        <div>
          <label
            htmlFor="signup-password"
            className="block text-sm font-medium text-surface-700 mb-2"
          >
            Create a password
          </label>
          <input
            ref={passwordRef}
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="Min. 8 characters"
            required
            minLength={8}
            className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
          />
          {passwordStrength && (
            <PasswordStrength strength={passwordStrength} />
          )}
        </div>
        <div>
          <label
            htmlFor="invite-code"
            className="block text-sm font-medium text-surface-700 mb-2"
          >
            Invite code <span className="text-surface-400 font-normal">(optional)</span>
          </label>
          <input
            id="invite-code"
            type="text"
            value={inviteCode}
            onChange={(e) => onInviteCodeChange(e.target.value.toUpperCase())}
            placeholder="e.g. BURNLESS2026"
            className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all font-mono tracking-wider"
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
              Creating account...
            </span>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      <button
        type="button"
        onClick={onBack}
        className="mt-5 w-full text-center text-sm text-surface-500 hover:text-brand-600 transition-colors font-medium"
      >
        &larr; Use a different email
      </button>
    </div>
  );
}
