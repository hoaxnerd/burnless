import Link from "next/link";
import { CookieSettingsButton } from "@/components/cookie-consent";
import { BrandLogo } from "@/components/brand-logo";

const footerGroups = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "#product" },
      { label: "Companion", href: "#companion" },
      { label: "Pricing", href: "/pricing" },
      { label: "Security", href: "/security" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Help & FAQ", href: "/help" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-surface-200 bg-surface-50/60">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-12 lg:flex-row lg:justify-between">
          {/* Brand block */}
          <div className="max-w-xs">
            <div className="flex items-center gap-1.5">
              <BrandLogo className="h-7 w-7" />
              <span className="text-lg font-semibold tracking-tight text-surface-900">burnless</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-surface-600">
              Financial intelligence for startups. Your numbers, always thinking ahead.
            </p>
            <div className="mt-6 flex gap-2">
              <a
                href="https://twitter.com/burnless"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-surface-200 text-surface-500 transition-colors hover:border-surface-300 hover:text-surface-900"
                aria-label="burnless on X"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://linkedin.com/company/burnless"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-surface-200 text-surface-500 transition-colors hover:border-surface-300 hover:text-surface-900"
                aria-label="burnless on LinkedIn"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Link groups */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:gap-16">
            {footerGroups.map((group) => (
              <div key={group.heading}>
                <h3 className="text-sm font-semibold text-surface-900">{group.heading}</h3>
                <ul className="mt-4 space-y-3">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-surface-600 transition-colors hover:text-surface-900"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  {group.heading === "Legal" && (
                    <li>
                      <CookieSettingsButton />
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 border-t border-surface-200 pt-8">
          <p className="text-xs text-surface-500">
            &copy; {new Date().getFullYear()} burnless, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
