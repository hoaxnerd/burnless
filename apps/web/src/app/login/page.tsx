"use client";

import { useState, useRef, useEffect } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { trackEvent, identifyUser } from "@/lib/analytics";

type AuthStep = "email" | "signin" | "signup";

export default function LoginPage() {
  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
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
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
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
        window.location.href = "/onboarding";
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
      {/* Gradient background */}
      <div className="absolute inset-0 bg-surface-50" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-500/[0.06] rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-brand-400/[0.04] rounded-full blur-3xl" />

      <div className="w-full max-w-[400px] px-4 relative z-10">
        {/* Logo & heading */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-8 group">
            <div className="h-11 w-11 rounded-xl bg-brand-600 flex items-center justify-center shadow-md shadow-brand-600/25 group-hover:shadow-lg group-hover:shadow-brand-600/30 transition-shadow">
              <span className="text-white font-bold text-lg">B</span>
            </div>
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

          {/* Step: Email entry */}
          {step === "email" && (
            <div style={{ animation: "fadeSlideIn 300ms ease-out" }}>
              <form onSubmit={handleEmailSubmit} className="space-y-5">
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
                    onChange={(e) => setEmail(e.target.value)}
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
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    trackEvent("auth_oauth_clicked", { provider: "google" });
                    signIn("google", { callbackUrl: "/dashboard" });
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm font-medium text-surface-700 hover:bg-surface-50 hover:border-surface-400 transition-all"
                >
                  <svg className="h-4.5 w-4.5" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Google
                </button>
                <button
                  type="button"
                  onClick={() => {
                    trackEvent("auth_oauth_clicked", { provider: "github" });
                    signIn("github", { callbackUrl: "/dashboard" });
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm font-medium text-surface-700 hover:bg-surface-50 hover:border-surface-400 transition-all"
                >
                  <svg
                    className="h-4.5 w-4.5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  GitHub
                </button>
              </div>
            </div>
          )}

          {/* Step: Sign In (returning user) */}
          {step === "signin" && (
            <div style={{ animation: "fadeSlideIn 300ms ease-out" }}>
              <form onSubmit={handleSignIn} className="space-y-5">
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
                    onChange={(e) => setPassword(e.target.value)}
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
                  onClick={handleBack}
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
          )}

          {/* Step: Sign Up (new user) */}
          {step === "signup" && (
            <div style={{ animation: "fadeSlideIn 300ms ease-out" }}>
              <form onSubmit={handleSignUp} className="space-y-5">
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
                    onChange={(e) => setName(e.target.value)}
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
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
                    className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                  />
                  {/* Password strength indicator */}
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
                onClick={handleBack}
                className="mt-5 w-full text-center text-sm text-surface-500 hover:text-brand-600 transition-colors font-medium"
              >
                &larr; Use a different email
              </button>
            </div>
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
