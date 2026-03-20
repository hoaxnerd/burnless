import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Terms of Service — Burnless",
  description:
    "Terms of Service for Burnless, the AI-powered financial planning platform for startups.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface-0 overflow-x-hidden">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <h1 className="text-3xl sm:text-4xl font-bold text-surface-900 mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-surface-400 mb-12">
          Last updated: March 21, 2026
        </p>

        <div className="prose-legal space-y-8 text-surface-600 text-[15px] leading-relaxed break-words">
          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using Burnless (&quot;the Service&quot;), operated
              by Burnless, Inc. (&quot;we&quot;, &quot;us&quot;, or
              &quot;our&quot;), you agree to be bound by these Terms of Service.
              If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              2. Description of Service
            </h2>
            <p>
              Burnless provides AI-powered financial planning tools for
              startups, including expense tracking, runway forecasting, revenue
              management, and AI-driven financial insights. The Service is
              provided &quot;as is&quot; and is intended for informational
              purposes. Burnless does not provide financial, tax, legal, or
              investment advice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              3. User Accounts
            </h2>
            <p>
              You must provide accurate, complete information when creating an
              account. You are responsible for safeguarding your account
              credentials and for all activity under your account. Notify us
              immediately at{" "}
              <a
                href="mailto:support@burnless.com"
                className="text-brand-600 hover:text-brand-700 underline underline-offset-2"
              >
                support@burnless.com
              </a>{" "}
              if you suspect unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              4. Acceptable Use
            </h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                Use the Service for any unlawful purpose or to violate any
                applicable law or regulation.
              </li>
              <li>
                Attempt to gain unauthorized access to any part of the Service
                or its related systems.
              </li>
              <li>
                Interfere with or disrupt the Service or servers or networks
                connected to it.
              </li>
              <li>
                Reverse-engineer, decompile, or disassemble any part of the
                Service.
              </li>
              <li>
                Upload or transmit viruses, malware, or other harmful code.
              </li>
              <li>
                Use automated tools to scrape, crawl, or extract data from the
                Service without our written permission.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              5. Intellectual Property
            </h2>
            <p>
              All content, features, and functionality of the Service —
              including text, graphics, logos, software, and AI models — are
              owned by Burnless, Inc. and are protected by intellectual property
              laws. You retain ownership of any data you upload to the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              6. Your Data
            </h2>
            <p>
              You retain all rights to the financial data you provide. We use
              your data solely to operate and improve the Service as described in
              our{" "}
              <a
                href="/privacy"
                className="text-brand-600 hover:text-brand-700 underline underline-offset-2"
              >
                Privacy Policy
              </a>
              . You may export or delete your data at any time through your
              account settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              7. AI Features
            </h2>
            <p>
              Burnless uses artificial intelligence to provide financial
              insights, categorization, and forecasting. AI-generated outputs
              are estimates and suggestions only. They are not a substitute for
              professional financial advice. We do not guarantee the accuracy,
              completeness, or reliability of AI-generated content.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              8. Subscriptions and Billing
            </h2>
            <p>
              Certain features of the Service require a paid subscription. By
              subscribing, you authorize us to charge your payment method on a
              recurring basis. You may cancel at any time; cancellation takes
              effect at the end of the current billing period. Refunds are
              handled in accordance with our refund policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              9. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by law, Burnless, Inc. shall not
              be liable for any indirect, incidental, special, consequential, or
              punitive damages, including loss of profits, data, or business
              opportunities, arising from your use of the Service. Our total
              liability shall not exceed the amount you paid us in the 12 months
              preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              10. Disclaimer of Warranties
            </h2>
            <p>
              The Service is provided &quot;as is&quot; and &quot;as
              available&quot; without warranties of any kind, whether express or
              implied, including implied warranties of merchantability, fitness
              for a particular purpose, and non-infringement.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              11. Termination
            </h2>
            <p>
              We may suspend or terminate your access to the Service at any time
              for violation of these Terms or for any other reason at our sole
              discretion. Upon termination, your right to use the Service ceases
              immediately, but provisions that by their nature should survive
              will remain in effect.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              12. Changes to Terms
            </h2>
            <p>
              We may update these Terms from time to time. We will notify you of
              material changes by posting the updated Terms on this page and
              updating the &quot;Last updated&quot; date. Continued use of the
              Service after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              13. Governing Law
            </h2>
            <p>
              These Terms are governed by and construed in accordance with the
              laws of the State of Delaware, without regard to its conflict of
              law provisions. Any disputes shall be resolved in the courts of
              Delaware.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              14. Contact
            </h2>
            <p>
              If you have any questions about these Terms, contact us at{" "}
              <a
                href="mailto:legal@burnless.com"
                className="text-brand-600 hover:text-brand-700 underline underline-offset-2"
              >
                legal@burnless.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
