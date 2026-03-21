import Link from "next/link";
import { CookieSettingsButton } from "@/components/cookie-consent";

const footerLinks = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Integrations", href: "#integrations" },
    { label: "Security", href: "/security" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Help & FAQ", href: "/help" },
{ label: "Contact", href: "/contact" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Security", href: "/security" },
  ],
};

export function LandingFooter() {
  return (
    <footer className="border-t border-surface-200/20 bg-surface-50/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <svg viewBox="0 0 32 32" fill="none" className="h-7 w-7" aria-hidden="true">
                <defs>
                  <linearGradient id="footer-logo-grad" x1="8" y1="28" x2="24" y2="4" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#2563eb" />
                    <stop offset="1" stopColor="#60a5fa" />
                  </linearGradient>
                </defs>
                <path d="M16 2C16 2 10 10 10 16C10 19.3 12.7 22 16 22C19.3 22 22 19.3 22 16C22 10 16 2 16 2Z" fill="url(#footer-logo-grad)" />
                <path d="M16 12C16 12 13 16 13 18.5C13 20.2 14.3 21.5 16 21.5C17.7 21.5 19 20.2 19 18.5C19 16 16 12 16 12Z" fill="#0f1729" />
                <circle cx="16" cy="28" r="2" fill="url(#footer-logo-grad)" opacity="0.6" />
              </svg>
              <span className="text-lg font-semibold text-surface-900">Burnless</span>
            </div>
            <p className="text-sm text-surface-500 leading-relaxed">
              AI-powered financial planning for startups. Know your runway, plan your future.
            </p>
            {/* Social links */}
            <div className="flex gap-3 mt-6">
              <a
                href="https://twitter.com/burnless"
                target="_blank"
                rel="noopener noreferrer"
                className="w-11 h-11 rounded-lg bg-surface-200/10 border border-surface-200/15 flex items-center justify-center text-surface-500 hover:text-surface-900 hover:border-surface-200/30 transition-colors"
                aria-label="Twitter"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://linkedin.com/company/burnless"
                target="_blank"
                rel="noopener noreferrer"
                className="w-11 h-11 rounded-lg bg-surface-200/10 border border-surface-200/15 flex items-center justify-center text-surface-500 hover:text-surface-900 hover:border-surface-200/30 transition-colors"
                aria-label="LinkedIn"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-surface-900 mb-4">{category}</h3>
              <ul className="space-y-0">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-surface-500 hover:text-surface-900 transition-colors inline-block py-3"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
                {category === "Legal" && (
                  <li>
                    <CookieSettingsButton />
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-surface-200/15">
          <p className="text-xs text-surface-500 text-center">
            &copy; {new Date().getFullYear()} Burnless, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
