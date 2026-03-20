"use client";

import { useState, useRef, useEffect } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

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
      setError("Wrong password. Please try again.");
      setIsLoading(false);
    } else {
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
        setError("Account created! Please sign in.");
        setStep("signin");
        setIsLoading(false);
      } else {
        window.location.href = "/onboarding";
      }
    } catch {
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
      ? "Enter your email to get started"
      : step === "signin"
        ? email
        : email;

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="h-10 w-10 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg">B</span>
            </div>
          </Link>
          <div
            className="transition-all duration-300 ease-out"
            key={step}
            style={{ animation: "fadeSlideIn 300ms ease-out" }}
          >
            <h1 className="text-2xl font-bold text-surface-900">{heading}</h1>
            <p className="mt-2 text-sm text-surface-500">{subtitle}</p>
          </div>
        </div>

        <div className="bg-surface-0 rounded-xl shadow-sm border border-surface-200 p-6">
          {/* Error display */}
          {error && (
            <div
              className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700"
              style={{ animation: "fadeSlideIn 200ms ease-out" }}
            >
              {error}
            </div>
          )}

          {/* Step: Email entry */}
          {step === "email" && (
            <div style={{ animation: "fadeSlideIn 300ms ease-out" }}>
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-surface-700 mb-1.5"
                  >
                    Email
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
                    className="w-full rounded-lg border border-surface-300 bg-surface-0 px-3 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isChecking || !email}
                  className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-all duration-200"
                >
                  {isChecking ? (
                    <span className="inline-flex items-center gap-2">
                      <LoadingSpinner />
                      Checking...
                    </span>
                  ) : (
                    "Continue"
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-surface-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-surface-0 px-2 text-surface-400">
                    Or continue with
                  </span>
                </div>
              </div>

              {/* Social auth */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() =>
                    signIn("google", { callbackUrl: "/dashboard" })
                  }
                  className="w-full flex items-center justify-center gap-3 rounded-lg border border-surface-300 bg-surface-0 px-4 py-2.5 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
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
                  Continue with Google
                </button>
                <button
                  type="button"
                  onClick={() =>
                    signIn("github", { callbackUrl: "/dashboard" })
                  }
                  className="w-full flex items-center justify-center gap-3 rounded-lg border border-surface-300 bg-surface-0 px-4 py-2.5 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
                >
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  Continue with GitHub
                </button>
              </div>
            </div>
          )}

          {/* Step: Sign In (returning user) */}
          {step === "signin" && (
            <div style={{ animation: "fadeSlideIn 300ms ease-out" }}>
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
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
                    className="w-full rounded-lg border border-surface-300 bg-surface-0 px-3 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-all duration-200"
                >
                  {isLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <LoadingSpinner />
                      Signing in...
                    </span>
                  ) : (
                    "Sign in"
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={handleBack}
                className="mt-4 w-full text-center text-sm text-surface-500 hover:text-surface-700 transition-colors"
              >
                &larr; Use a different email
              </button>
            </div>
          )}

          {/* Step: Sign Up (new user) */}
          {step === "signup" && (
            <div style={{ animation: "fadeSlideIn 300ms ease-out" }}>
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium text-surface-700 mb-1.5"
                  >
                    Your name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full rounded-lg border border-surface-300 bg-surface-0 px-3 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow"
                  />
                </div>
                <div>
                  <label
                    htmlFor="signup-password"
                    className="block text-sm font-medium text-surface-700 mb-1.5"
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
                    className="w-full rounded-lg border border-surface-300 bg-surface-0 px-3 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-all duration-200"
                >
                  {isLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <LoadingSpinner />
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
                className="mt-4 w-full text-center text-sm text-surface-500 hover:text-surface-700 transition-colors"
              >
                &larr; Use a different email
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-surface-400">
          By continuing, you agree to our Terms and Privacy Policy.
        </p>
      </div>

    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
