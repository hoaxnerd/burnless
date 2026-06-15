import Link from "next/link";
import { Github } from "lucide-react";
import { CookieSettingsButton } from "@/components/cookie-consent";
import { BrandLogo } from "@/components/brand-logo";
import { getCapabilities } from "@/lib/capabilities";
import { GITHUB_REPO_URL } from "@/lib/public-repo";

/* Shared footer for the home + marketing/legal pages. Keep the `LandingFooter`
   export (no required props) — eight pages depend on it. Pricing is hidden in
   holding mode (selfServeSignup off), matching the nav + the /pricing 404. */

type FooterLink = { label: string; href: string };
type FooterGroup = { heading: string; links: FooterLink[] };

const footerGroups: FooterGroup[] = [
  {
    heading: "Product",
    links: [
      { label: "Companion", href: "/#companion" },
      { label: "Dashboard", href: "/#product" },
      { label: "Open source", href: "/#open-source" },
      { label: "Install", href: "/install" },
      { label: "Pricing", href: "/pricing" },
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
      { label: "Security", href: "/security" },
    ],
  },
];

export function LandingFooter() {
  // Hide Pricing in holding mode (signup off) — matches the nav + the /pricing 404.
  const { selfServeSignup } = getCapabilities();
  const groups = selfServeSignup
    ? footerGroups
    : footerGroups.map((g) => ({ ...g, links: g.links.filter((l) => l.href !== "/pricing") }));

  return (
    <footer className="border-t border-surface-200 bg-surface-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          {/* Brand block */}
          <div className="max-w-xs">
            <div className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-surface-900">
              <BrandLogo className="h-7 w-7" />
              burnless
            </div>
            <p className="mt-3 text-sm leading-relaxed text-surface-500">
              The always-on financial companion for startups. Open source, self-hostable in one
              command.
            </p>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="burnless on GitHub"
              className="mt-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-surface-200 text-surface-600 transition-colors hover:border-accent-200 hover:bg-accent-50 hover:text-accent-600"
            >
              <Github className="h-[18px] w-[18px]" />
            </a>
          </div>

          {/* Link groups */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-x-16">
            {groups.map((group) => (
              <div key={group.heading}>
                <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-surface-900">
                  {group.heading}
                </h3>
                <ul className="space-y-3">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-surface-600 transition-colors hover:text-brand-600"
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

        <div className="mt-12 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-surface-200 pt-6 text-xs text-surface-500">
          <span>&copy; {new Date().getFullYear()} burnless</span>
          <span>AGPL-3.0 &middot; Apache-2.0 (CLI) &middot; built in the open</span>
        </div>
      </div>
    </footer>
  );
}
