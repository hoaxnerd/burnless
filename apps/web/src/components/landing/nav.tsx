"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "./theme-toggle";

/* N5 — Floating pill nav (modern-minimal). Content-sized, detached from the
   viewport edges, blur backdrop. On mobile the section links collapse into a
   sheet behind a menu button (links were previously unreachable on small
   screens). */

const navLinks = [
  { label: "Product", href: "#product" },
  { label: "Companion", href: "#companion" },
  { label: "Pricing", href: "/pricing" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 sm:pt-5">
      <nav
        className={`relative flex w-full max-w-3xl items-center gap-2 rounded-full border py-2 pl-4 pr-2 transition-shadow duration-300 ${
          scrolled
            ? "border-surface-200/70 bg-surface-0/85 shadow-md backdrop-blur-xl"
            : "border-surface-200/40 bg-surface-0/60 shadow-sm backdrop-blur-md"
        }`}
      >
        <Link href="/" className="flex items-center gap-1.5 pr-1" aria-label="burnless home">
          <BrandLogo className="h-7 w-7" />
          <span className="text-lg font-semibold tracking-tight text-surface-900">burnless</span>
        </Link>

        {/* Desktop links */}
        <div className="ml-2 hidden items-center gap-1 sm:flex">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-surface-600 transition-colors hover:bg-surface-100/70 hover:text-surface-900"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Link
            href="/login"
            onClick={() => trackEvent("landing_nav_login_clicked")}
            className="hidden whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-surface-600 transition-colors hover:text-surface-900 sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/login"
            onClick={() => trackEvent("landing_nav_signup_clicked")}
            className="press-effect whitespace-nowrap rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Start free
          </Link>
          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full text-surface-600 transition-colors hover:bg-surface-100/70 hover:text-surface-900 sm:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile sheet */}
        {menuOpen && (
          <div className="absolute inset-x-0 top-full mt-2 rounded-2xl border border-surface-200 bg-surface-0/95 p-2 shadow-lg backdrop-blur-xl sm:hidden">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-xl px-4 py-3 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-100"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => {
                trackEvent("landing_nav_login_clicked");
                setMenuOpen(false);
              }}
              className="block rounded-xl px-4 py-3 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-100"
            >
              Log in
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
