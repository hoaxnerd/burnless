"use client";

import Link from "next/link";
import { useState } from "react";
import { Github, Menu, X } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { BrandLogo } from "@/components/brand-logo";
import { useCapabilities } from "@/components/providers/capability-context";
import { GITHUB_REPO_URL } from "@/lib/public-repo";
import { ThemeToggle } from "./theme-toggle";

/* Full-width, bold, static masthead (not floating, not sticky). Links read ink
   and switch to brand on hover; the primary CTA swaps brand → accent on hover.
   Section links collapse into a sheet below the md breakpoint. CTAs are
   capability-gated: in marketing/holding mode (selfServeSignup off) every
   sign-in CTA becomes "Star on GitHub" and Pricing is hidden. */

// Absolute "/#…" anchors so the section links also work from the marketing/
// legal pages (about, pricing, …) that share this nav, not just the home page.
const navLinks = [
  { label: "Product", href: "/#product" },
  { label: "Companion", href: "/#companion" },
  { label: "Open source", href: "/#open-source" },
  { label: "Pricing", href: "/pricing" },
];

export function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { selfServeSignup } = useCapabilities();
  const links = selfServeSignup ? navLinks : navLinks.filter((l) => l.href !== "/pricing");

  return (
    <header className="relative z-50">
      <div className="mx-auto flex max-w-7xl items-center gap-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-10">
        <Link
          href="/"
          className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-surface-900 transition-colors hover:text-brand-600"
          aria-label="burnless home"
        >
          <BrandLogo className="h-7 w-7 sm:h-8 sm:w-8" />
          burnless
        </Link>

        {/* Desktop section links */}
        <nav className="ml-8 hidden items-center gap-7 md:flex">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="whitespace-nowrap text-base font-semibold text-surface-700 transition-colors hover:text-brand-600"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <ThemeToggle />
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="burnless on GitHub"
            onClick={() => trackEvent("landing_nav_github_clicked")}
            className="hidden h-10 w-10 items-center justify-center rounded-xl text-surface-600 transition-colors hover:bg-accent-50 hover:text-accent-600 sm:inline-flex"
          >
            <Github className="h-[18px] w-[18px]" />
          </a>

          {selfServeSignup ? (
            <>
              <Link
                href="/login"
                onClick={() => trackEvent("landing_nav_login_clicked")}
                className="hidden whitespace-nowrap rounded-xl px-3 py-2.5 text-[0.95rem] font-semibold text-surface-700 transition-colors hover:text-brand-600 sm:inline-flex"
              >
                Log in
              </Link>
              <Link
                href="/login"
                onClick={() => trackEvent("landing_nav_signup_clicked")}
                className="press-effect whitespace-nowrap rounded-xl bg-brand-600 px-5 py-2.5 text-[0.95rem] font-bold text-white shadow-[0_2px_8px_rgb(37_99_235/0.28)] transition-colors hover:bg-accent-600"
              >
                Start free
              </Link>
            </>
          ) : (
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackEvent("landing_nav_github_cta_clicked")}
              className="press-effect inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-brand-600 px-4 py-2.5 text-[0.95rem] font-bold text-white shadow-[0_2px_8px_rgb(37_99_235/0.28)] transition-colors hover:bg-accent-600 sm:px-5"
            >
              <Github className="h-4 w-4" />
              <span className="hidden sm:inline">Star on GitHub</span>
              <span className="sm:hidden">Star</span>
            </a>
          )}

          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-surface-600 transition-colors hover:bg-surface-100 hover:text-surface-900 md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      {menuOpen && (
        <div className="mx-4 mb-2 rounded-2xl border border-surface-200 bg-surface-0 p-2 shadow-lg md:hidden">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="block rounded-xl px-4 py-3 text-sm font-semibold text-surface-700 transition-colors hover:bg-surface-100 hover:text-surface-900"
            >
              {link.label}
            </Link>
          ))}
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              trackEvent("landing_nav_github_clicked");
              setMenuOpen(false);
            }}
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-surface-700 transition-colors hover:bg-surface-100 hover:text-surface-900"
          >
            <Github className="h-4 w-4" />
            View on GitHub
          </a>
        </div>
      )}
    </header>
  );
}
