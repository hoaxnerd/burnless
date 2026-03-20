"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";

function BurnlessLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Flame-inspired mark — represents burning less / financial clarity */}
      <defs>
        <linearGradient id="logo-grad" x1="8" y1="28" x2="24" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563eb" />
          <stop offset="1" stopColor="#60a5fa" />
        </linearGradient>
      </defs>
      <path
        d="M16 2C16 2 10 10 10 16C10 19.3 12.7 22 16 22C19.3 22 22 19.3 22 16C22 10 16 2 16 2Z"
        fill="url(#logo-grad)"
      />
      <path
        d="M16 12C16 12 13 16 13 18.5C13 20.2 14.3 21.5 16 21.5C17.7 21.5 19 20.2 19 18.5C19 16 16 12 16 12Z"
        fill="#0f1729"
      />
      <circle cx="16" cy="28" r="2" fill="url(#logo-grad)" opacity="0.6" />
    </svg>
  );
}

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-surface-0/80 backdrop-blur-xl border-b border-surface-200/50 shadow-lg"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <BurnlessLogo className="h-8 w-8 transition-transform duration-300 group-hover:scale-110" />
            <span className="text-xl font-semibold text-surface-900 tracking-tight">
              Burnless
            </span>
          </Link>

          <nav className="hidden sm:flex items-center gap-8">
            <a
              href="#features"
              className="text-sm font-medium text-surface-500 hover:text-surface-900 transition-colors"
            >
              Features
            </a>
            <a
              href="#ai-demo"
              className="text-sm font-medium text-surface-500 hover:text-surface-900 transition-colors"
            >
              AI Companion
            </a>
            <Link
              href="/login"
              onClick={() => trackEvent("landing_nav_login_clicked")}
              className="text-sm font-medium text-surface-500 hover:text-surface-900 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/login"
              onClick={() => trackEvent("landing_nav_signup_clicked")}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-400 transition-colors shadow-md shadow-brand-500/25"
            >
              Start free
            </Link>
          </nav>

          {/* Mobile menu button */}
          <Link
            href="/login"
            className="sm:hidden rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
