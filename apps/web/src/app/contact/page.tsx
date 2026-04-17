import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Contact Us — burnless",
  description:
    "Get in touch with the burnless team. We're here to help with questions, feedback, and support.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-surface-0 overflow-x-hidden">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <h1 className="text-3xl sm:text-4xl font-bold text-surface-900 mb-2">
          Contact Us
        </h1>
        <p className="text-surface-500 mb-12 max-w-xl">
          Have a question, feedback, or need help? Reach out — we typically
          respond within one business day.
        </p>

        <div className="grid gap-8 sm:grid-cols-2">
          {/* General support */}
          <div className="rounded-xl border border-surface-200/30 bg-surface-50/50 p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100/60">
              <svg
                className="h-5 w-5 text-brand-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-surface-900 mb-1">
              General Support
            </h2>
            <p className="text-sm text-surface-500 mb-4">
              Questions about your account, features, or billing.
            </p>
            <a
              href="mailto:support@burnless.com"
              className="text-sm font-medium text-brand-600 hover:text-brand-700 underline underline-offset-2"
            >
              support@burnless.com
            </a>
          </div>

          {/* Sales */}
          <div className="rounded-xl border border-surface-200/30 bg-surface-50/50 p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100/60">
              <svg
                className="h-5 w-5 text-brand-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-surface-900 mb-1">
              Sales &amp; Partnerships
            </h2>
            <p className="text-sm text-surface-500 mb-4">
              Enterprise plans, custom integrations, or partnerships.
            </p>
            <a
              href="mailto:sales@burnless.com"
              className="text-sm font-medium text-brand-600 hover:text-brand-700 underline underline-offset-2"
            >
              sales@burnless.com
            </a>
          </div>

          {/* Security */}
          <div className="rounded-xl border border-surface-200/30 bg-surface-50/50 p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100/60">
              <svg
                className="h-5 w-5 text-brand-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-surface-900 mb-1">
              Security Reports
            </h2>
            <p className="text-sm text-surface-500 mb-4">
              Report a security vulnerability responsibly.
            </p>
            <a
              href="mailto:security@burnless.com"
              className="text-sm font-medium text-brand-600 hover:text-brand-700 underline underline-offset-2"
            >
              security@burnless.com
            </a>
          </div>

          {/* Legal / Privacy */}
          <div className="rounded-xl border border-surface-200/30 bg-surface-50/50 p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100/60">
              <svg
                className="h-5 w-5 text-brand-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-surface-900 mb-1">
              Legal &amp; Privacy
            </h2>
            <p className="text-sm text-surface-500 mb-4">
              Data requests, privacy questions, or legal inquiries.
            </p>
            <a
              href="mailto:legal@burnless.com"
              className="text-sm font-medium text-brand-600 hover:text-brand-700 underline underline-offset-2"
            >
              legal@burnless.com
            </a>
          </div>
        </div>

        {/* Office info */}
        <div className="mt-12 rounded-xl border border-surface-200/30 bg-surface-50/50 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-3">
            Company
          </h2>
          <p className="text-sm text-surface-600">
            burnless, Inc.
            <br />
            Delaware, United States
          </p>
          <div className="mt-4 flex gap-3">
            <a
              href="https://twitter.com/burnless"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-surface-500 hover:text-surface-900 transition-colors"
            >
              Twitter / X
            </a>
            <span className="text-surface-300">·</span>
            <a
              href="https://linkedin.com/company/burnless"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-surface-500 hover:text-surface-900 transition-colors"
            >
              LinkedIn
            </a>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
