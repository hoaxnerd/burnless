"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { trackEvent, identifyUser } from "@/lib/analytics";
import { BrandLogo } from "@/components/brand-logo";
import type { AuthStep, PasswordStrength } from "./_components/types";
import { EmailStep } from "./_components/email-step";
import { SignInStep } from "./_components/signin-step";
import { SignUpStep } from "./_components/signup-step";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState(searchParams.get("invite") ?? "");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "signin" || step === "signup") {
      passwordRef.current?.focus();
    }
  }, [step]);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setIsChecking(true);
    setError("");

    try {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        setIsChecking(false);
        return;
      }

      const { exists } = await res.json();
      trackEvent("auth_email_submitted", { account_exists: exists });
      setStep(exists ? "signin" : "signup");
    } catch {
      setError("Unable to connect. Please check your internet.");
    } finally {
      setIsChecking(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        trackEvent("auth_signin_error", { method: "credentials" });
        setError("Wrong password. Please try again.");
        setIsLoading(false);
      } else {
        trackEvent("auth_signin_success", { method: "credentials" });
        identifyUser(email);
        window.location.href = "/dashboard";
      }
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name: name || undefined,
          inviteCode: inviteCode || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Could not create account. Please try again.");
        setIsLoading(false);
        return;
      }

      // Auto sign-in after registration
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        trackEvent("auth_signup_partial", { step: "auto_signin_failed" });
        setError("Account created! Please sign in.");
        setStep("signin");
        setIsLoading(false);
      } else {
        trackEvent("auth_signup_success", { method: "credentials" });
        identifyUser(email, { name: name || undefined });
        window.location.href = "/dashboard";
      }
    } catch {
      trackEvent("auth_signup_error", { method: "credentials" });
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  }

  function handleBack() {
    setStep("email");
    setPassword("");
    setName("");
    setError("");
    setTimeout(() => emailRef.current?.focus(), 100);
  }

  const heading =
    step === "email"
      ? "Welcome to Burnless"
      : step === "signin"
        ? "Welcome back"
        : "Create your account";

  const subtitle =
    step === "email"
      ? "Financial planning that feels like a superpower"
      : step === "signin"
        ? email
        : email;

  const passwordStrength: PasswordStrength =
    password.length === 0
      ? null
      : password.length < 8
        ? "weak"
        : password.length < 12
          ? "fair"
          : "strong";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-surface-50" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-500/[0.06] rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-brand-400/[0.04] rounded-full blur-3xl" />

      <div className="w-full max-w-[400px] px-4 relative z-10">
        {/* Logo & heading */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-8 group">
            <BrandLogo className="h-11 w-11" />
            <span className="text-lg font-bold text-surface-900">Burnless</span>
          </Link>
          <div
            className="transition-all duration-300 ease-out"
            key={step}
            style={{ animation: "fadeSlideIn 300ms ease-out" }}
          >
            <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
              {heading}
            </h1>
            <p className="mt-2 text-sm text-surface-500">{subtitle}</p>
          </div>
        </div>

        {/* Form card */}
        <div className="bg-surface-0 rounded-2xl shadow-lg border border-surface-200/80 p-7">
          {/* Error display */}
          {error && (
            <div
              className="mb-5 flex items-start gap-2.5 rounded-xl bg-danger-50 border border-danger-100 px-4 py-3 text-sm text-danger-700"
              style={{ animation: "fadeSlideIn 200ms ease-out" }}
            >
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

          {step === "email" && (
            <EmailStep
              email={email}
              onEmailChange={setEmail}
              onSubmit={handleEmailSubmit}
              isChecking={isChecking}
              emailRef={emailRef}
            />
          )}

          {step === "signin" && (
            <SignInStep
              email={email}
              password={password}
              onPasswordChange={setPassword}
              onSubmit={handleSignIn}
              onBack={handleBack}
              isLoading={isLoading}
              passwordRef={passwordRef}
            />
          )}

          {step === "signup" && (
            <SignUpStep
              name={name}
              onNameChange={setName}
              password={password}
              onPasswordChange={setPassword}
              inviteCode={inviteCode}
              onInviteCodeChange={setInviteCode}
              onSubmit={handleSignUp}
              onBack={handleBack}
              isLoading={isLoading}
              passwordStrength={passwordStrength}
              passwordRef={passwordRef}
            />
          )}
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-surface-400">
          By continuing, you agree to our{" "}
          <Link href="/terms" className="text-surface-500 hover:text-brand-600 transition-colors underline underline-offset-2 inline-block py-2">
            Terms
          </Link>
          {" "}and{" "}
          <Link href="/privacy" className="text-surface-500 hover:text-brand-600 transition-colors underline underline-offset-2 inline-block py-2">
            Privacy Policy
          </Link>
        </p>

        {/* Trust signals */}
        <div className="mt-6 flex items-center justify-center gap-4 text-surface-400">
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <span className="text-[11px] font-medium">256-bit SSL</span>
          </div>
          <div className="h-3 w-px bg-surface-300" />
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <span className="text-[11px] font-medium">SOC 2 ready</span>
          </div>
        </div>
      </div>
    </div>
  );
}
