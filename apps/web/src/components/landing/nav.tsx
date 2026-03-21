"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { BrandLogo } from "@/components/brand-logo";

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
          <Link href="/" className="flex items-center gap-2.5 min-h-[44px] group">
            <BrandLogo className="h-8 w-8 transition-transform duration-300 group-hover:scale-110" />
            <span className="text-xl font-semibold text-surface-900 tracking-tight">
              Burnless
            </span>
          </Link>

          <nav className="hidden sm:flex items-center gap-8">
            <a
              href="#features"
              className="text-sm font-medium text-surface-500 hover:text-surface-900 transition-colors py-2.5"
            >
              Features
            </a>
            <a
              href="#ai-demo"
              className="text-sm font-medium text-surface-500 hover:text-surface-900 transition-colors py-2.5"
            >
              AI Companion
            </a>
            <Link
              href="/login"
              onClick={() => trackEvent("landing_nav_login_clicked")}
              className="text-sm font-medium text-surface-500 hover:text-surface-900 transition-colors py-2.5"
            >
              Log in
            </Link>
            <Link
              href="/login"
              onClick={() => trackEvent("landing_nav_signup_clicked")}
              className="rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-400 transition-colors shadow-md shadow-brand-500/25"
            >
              Start free
            </Link>
          </nav>

          {/* Mobile menu button */}
          <Link
            href="/login"
            className="sm:hidden rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
