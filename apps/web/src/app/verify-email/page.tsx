"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

type VerifyStep = "waiting" | "verifying" | "success" | "error";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const { data: session, update: updateSession } = useSession();

  const token = searchParams.get("token");
  const emailParam = searchParams.get("email");

  const [step, setStep] = useState<VerifyStep>(token ? "verifying" : "waiting");
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  const verifyToken = useCallback(async () => {
    if (!token || !emailParam) return;

    setStep("verifying");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailParam, token }),
      });

      if (res.ok) {
        setStep("success");
        // Refresh the session so emailVerified is updated in the JWT
        await updateSession();
      } else {
        const data = await res.json();
        setError(data.error || "Verification failed. Please try again.");
        setStep("error");
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setStep("error");
    }
  }, [token, emailParam, updateSession]);

  useEffect(() => {
    if (token && emailParam) {
      verifyToken();
    }
  }, [token, emailParam, verifyToken]);

  // Cooldown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function handleResend() {
    const targetEmail = emailParam || session?.user?.email;
    if (!targetEmail || resendCooldown > 0) return;

    try {
      await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      setResendCooldown(60);
    } catch {
      // Silently fail — the API always returns 200
    }
  }

  const displayEmail = emailParam || session?.user?.email || "your email";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-surface-50" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-500/[0.06] rounded-full blur-3xl" />

      <div className="w-full max-w-[440px] px-4 relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-8 group">
            <div className="h-11 w-11 rounded-xl bg-brand-600 flex items-center justify-center shadow-md shadow-brand-600/25">
              <span className="text-white font-bold text-lg">B</span>
            </div>
            <span className="text-lg font-bold text-surface-900">Burnless</span>
          </Link>
        </div>

        <div className="bg-surface-0 rounded-2xl shadow-lg border border-surface-200/80 p-8">
          {/* Waiting — user just registered, needs to check their email */}
          {step === "waiting" && (
            <div className="text-center" style={{ animation: "fadeSlideIn 300ms ease-out" }}>
              <div className="mx-auto mb-5 h-14 w-14 rounded-full bg-brand-50 flex items-center justify-center">
                <svg className="h-7 w-7 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-surface-900 mb-2">Check your email</h1>
              <p className="text-sm text-surface-500 mb-6 leading-relaxed">
                We sent a verification link to<br />
                <span className="font-medium text-surface-700">{displayEmail}</span>
              </p>
              <p className="text-xs text-surface-400 mb-6">
                Click the link in the email to verify your account and get started.
              </p>

              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className="text-sm font-medium text-brand-600 hover:text-brand-700 disabled:text-surface-400 transition-colors"
              >
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Didn't get the email? Resend"}
              </button>
            </div>
          )}

          {/* Verifying — spinner while we validate the token */}
          {step === "verifying" && (
            <div className="text-center py-4" style={{ animation: "fadeSlideIn 300ms ease-out" }}>
              <div className="mx-auto mb-5 h-10 w-10 rounded-full border-2 border-brand-200 border-t-brand-600 animate-spin" />
              <h1 className="text-xl font-bold text-surface-900 mb-2">Verifying your email</h1>
              <p className="text-sm text-surface-500">Just a moment...</p>
            </div>
          )}

          {/* Success — email verified */}
          {step === "success" && (
            <div className="text-center" style={{ animation: "fadeSlideIn 300ms ease-out" }}>
              <div className="mx-auto mb-5 h-14 w-14 rounded-full bg-success-50 flex items-center justify-center">
                <svg className="h-7 w-7 text-success-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-surface-900 mb-2">Email verified!</h1>
              <p className="text-sm text-surface-500 mb-6">
                Your account is ready. Let&apos;s get started.
              </p>
              <Link
                href="/onboarding"
                className="inline-block w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-all text-center shadow-sm shadow-brand-600/20"
              >
                Continue to setup &rarr;
              </Link>
            </div>
          )}

          {/* Error — token invalid or expired */}
          {step === "error" && (
            <div className="text-center" style={{ animation: "fadeSlideIn 300ms ease-out" }}>
              <div className="mx-auto mb-5 h-14 w-14 rounded-full bg-danger-50 flex items-center justify-center">
                <svg className="h-7 w-7 text-danger-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-surface-900 mb-2">Verification failed</h1>
              <p className="text-sm text-surface-500 mb-6">{error}</p>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-all shadow-sm shadow-brand-600/20"
              >
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Send new verification email"}
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-surface-400">
          Wrong email?{" "}
          <Link href="/login" className="text-surface-500 hover:text-brand-600 transition-colors underline underline-offset-2">
            Sign in with a different account
          </Link>
        </p>
      </div>
    </div>
  );
}
