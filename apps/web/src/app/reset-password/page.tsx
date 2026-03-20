"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Step = "request" | "sent" | "reset" | "success";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get("token");
  const emailParam = searchParams.get("email") ?? "";

  const [step, setStep] = useState<Step>(tokenParam ? "reset" : "request");
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        setIsLoading(false);
        return;
      }

      setStep("sent");
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailParam, token: tokenParam, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Could not reset password.");
        setIsLoading(false);
        return;
      }

      setStep("success");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const passwordStrength =
    password.length === 0
      ? null
      : password.length < 8
        ? "weak"
        : password.length < 12
          ? "fair"
          : "strong";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-surface-50" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-500/[0.06] rounded-full blur-3xl" />

      <div className="w-full max-w-[400px] px-4 relative z-10">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-8 group">
            <div className="h-11 w-11 rounded-xl bg-brand-600 flex items-center justify-center shadow-md shadow-brand-600/25">
              <span className="text-white font-bold text-lg">B</span>
            </div>
            <span className="text-lg font-bold text-surface-900">Burnless</span>
          </Link>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
            {step === "request" && "Reset your password"}
            {step === "sent" && "Check your email"}
            {step === "reset" && "Choose a new password"}
            {step === "success" && "Password updated"}
          </h1>
          <p className="mt-2 text-sm text-surface-500">
            {step === "request" &&
              "Enter your email and we'll send a reset link."}
            {step === "sent" &&
              "If an account exists, we sent a reset link."}
            {step === "reset" && emailParam}
            {step === "success" &&
              "You can now sign in with your new password."}
          </p>
        </div>

        <div className="bg-surface-0 rounded-2xl shadow-lg border border-surface-200/80 p-7">
          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-danger-50 border border-danger-100 px-4 py-3 text-sm text-danger-700">
              <svg
                className="h-4 w-4 mt-0.5 shrink-0 text-danger-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {step === "request" && (
            <form onSubmit={handleRequestReset} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-surface-700 mb-2"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@startup.com"
                  required
                  autoFocus
                  className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !email}
                className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 transition-all duration-200 shadow-sm shadow-brand-600/20"
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Sending...
                  </span>
                ) : (
                  "Send reset link"
                )}
              </button>
            </form>
          )}

          {step === "sent" && (
            <div className="text-center py-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-success-50 flex items-center justify-center mb-4">
                <svg
                  className="h-6 w-6 text-success-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                  />
                </svg>
              </div>
              <p className="text-sm text-surface-600">
                Check <strong>{email}</strong> for a reset link.
                <br />
                <span className="text-surface-400">
                  Didn&apos;t get it? Check spam or try again.
                </span>
              </p>
            </div>
          )}

          {step === "reset" && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <label
                  htmlFor="new-password"
                  className="block text-sm font-medium text-surface-700 mb-2"
                >
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                  autoFocus
                  className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                />
                {password.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 flex gap-1">
                      <div
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          passwordStrength === "weak"
                            ? "bg-danger-500"
                            : passwordStrength === "fair"
                              ? "bg-warning-500"
                              : "bg-success-500"
                        }`}
                      />
                      <div
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          passwordStrength === "fair"
                            ? "bg-warning-500"
                            : passwordStrength === "strong"
                              ? "bg-success-500"
                              : "bg-surface-200"
                        }`}
                      />
                      <div
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          passwordStrength === "strong"
                            ? "bg-success-500"
                            : "bg-surface-200"
                        }`}
                      />
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        passwordStrength === "weak"
                          ? "text-danger-600"
                          : passwordStrength === "fair"
                            ? "text-warning-600"
                            : "text-success-600"
                      }`}
                    >
                      {passwordStrength === "weak"
                        ? "Weak"
                        : passwordStrength === "fair"
                          ? "Fair"
                          : "Strong"}
                    </span>
                  </div>
                )}
              </div>
              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-sm font-medium text-surface-700 mb-2"
                >
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  required
                  minLength={8}
                  className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || password.length < 8}
                className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 transition-all duration-200 shadow-sm shadow-brand-600/20"
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Resetting...
                  </span>
                ) : (
                  "Reset password"
                )}
              </button>
            </form>
          )}

          {step === "success" && (
            <div className="text-center py-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-success-50 flex items-center justify-center mb-4">
                <svg
                  className="h-6 w-6 text-success-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
              </div>
              <Link
                href="/login"
                className="inline-block rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-all shadow-sm shadow-brand-600/20"
              >
                Sign in
              </Link>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-surface-500">
          <Link
            href="/login"
            className="hover:text-brand-600 transition-colors font-medium"
          >
            &larr; Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
