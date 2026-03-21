import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Privacy Policy — Burnless",
  description:
    "Privacy Policy for Burnless. Learn how we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface-0 overflow-x-hidden">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <h1 className="text-3xl sm:text-4xl font-bold text-surface-900 mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-surface-400 mb-12">
          Last updated: March 21, 2026
        </p>

        <div className="prose-legal space-y-8 text-surface-600 text-[15px] leading-relaxed break-words">
          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              1. Introduction
            </h2>
            <p>
              Burnless, Inc. (&quot;we&quot;, &quot;us&quot;, or
              &quot;our&quot;) is committed to protecting your privacy. This
              Privacy Policy explains how we collect, use, disclose, and
              safeguard your information when you use Burnless (&quot;the
              Service&quot;). By using the Service, you consent to the practices
              described in this policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              2. Information We Collect
            </h2>

            <h3 className="text-base font-medium text-surface-800 mt-4 mb-2">
              2.1 Information You Provide
            </h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong>Account information:</strong> name, email address, and
                authentication credentials (via Google, GitHub, or email/password).
              </li>
              <li>
                <strong>Financial data:</strong> expenses, revenue, funding
                rounds, and other financial information you enter or import.
              </li>
              <li>
                <strong>Payment information:</strong> billing details processed
                securely through Stripe. We do not store your full card number.
              </li>
              <li>
                <strong>Communications:</strong> any messages you send us via
                email or support channels.
              </li>
            </ul>

            <h3 className="text-base font-medium text-surface-800 mt-4 mb-2">
              2.2 Information Collected Automatically
            </h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong>Usage data:</strong> pages visited, features used,
                actions taken, and timestamps.
              </li>
              <li>
                <strong>Device information:</strong> browser type, operating
                system, device type, and screen resolution.
              </li>
              <li>
                <strong>Cookies and similar technologies:</strong> see Section 7
                for our cookie policy.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              3. How We Use Your Information
            </h2>
            <p>We use your information to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Provide, operate, and maintain the Service.</li>
              <li>
                Process your financial data and generate AI-powered insights,
                forecasts, and categorizations.
              </li>
              <li>Process payments and manage your subscription.</li>
              <li>
                Send transactional emails (account verification, billing
                receipts, security alerts).
              </li>
              <li>
                Improve the Service through analytics and usage patterns
                (aggregated and anonymized).
              </li>
              <li>Respond to your inquiries and provide customer support.</li>
              <li>
                Comply with legal obligations and enforce our Terms of Service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              4. How We Share Your Information
            </h2>
            <p>
              We do not sell your personal information. We may share your
              information with:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                <strong>Service providers:</strong> trusted third parties that
                help us operate the Service (hosting, payment processing,
                analytics, AI model providers). These providers are bound by
                data processing agreements.
              </li>
              <li>
                <strong>AI processing:</strong> financial data you enter may be
                processed by third-party AI models to generate insights. This
                data is not used to train AI models and is processed under
                strict data processing agreements.
              </li>
              <li>
                <strong>Legal requirements:</strong> when required by law,
                regulation, or legal process.
              </li>
              <li>
                <strong>Business transfers:</strong> in connection with a
                merger, acquisition, or sale of assets, with appropriate notice.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              5. Data Retention
            </h2>
            <p>
              We retain your data for as long as your account is active or as
              needed to provide the Service. You may delete your account and
              data at any time through your account settings. After deletion, we
              will remove your personal data within 30 days, except where
              retention is required by law (e.g., billing records).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              6. Data Security
            </h2>
            <p>
              We implement industry-standard security measures to protect your
              data, including encryption in transit (TLS) and at rest, access
              controls, regular security audits, and secure infrastructure. No
              method of transmission or storage is 100% secure, but we strive to
              use commercially acceptable means to protect your data.
            </p>
          </section>

          <section id="cookies">
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              7. Cookies and Tracking Technologies
            </h2>
            <p>We use the following types of cookies:</p>

            <h3 className="text-base font-medium text-surface-800 mt-4 mb-2">
              7.1 Essential Cookies
            </h3>
            <p>Required for the Service to function. These cannot be disabled.</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-surface-200/50">
                    <th className="text-left font-medium py-2 pr-4">Cookie</th>
                    <th className="text-left font-medium py-2 pr-4">Purpose</th>
                    <th className="text-left font-medium py-2">Duration</th>
                  </tr>
                </thead>
                <tbody className="text-surface-600">
                  <tr className="border-b border-surface-200/30">
                    <td className="py-2 pr-4 font-mono text-xs">next-auth.session-token</td>
                    <td className="py-2 pr-4">Maintains your authenticated session</td>
                    <td className="py-2">30 days</td>
                  </tr>
                  <tr className="border-b border-surface-200/30">
                    <td className="py-2 pr-4 font-mono text-xs">next-auth.csrf-token</td>
                    <td className="py-2 pr-4">Protects against cross-site request forgery</td>
                    <td className="py-2">Session</td>
                  </tr>
                  <tr className="border-b border-surface-200/30">
                    <td className="py-2 pr-4 font-mono text-xs">next-auth.callback-url</td>
                    <td className="py-2 pr-4">Stores redirect URL after authentication</td>
                    <td className="py-2">Session</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-xs">burnless-cookie-consent</td>
                    <td className="py-2 pr-4">Remembers your cookie preferences</td>
                    <td className="py-2">1 year</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-base font-medium text-surface-800 mt-4 mb-2">
              7.2 Analytics Cookies
            </h3>
            <p>Help us understand how users interact with the Service. Only set with your explicit consent.</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-surface-200/50">
                    <th className="text-left font-medium py-2 pr-4">Cookie</th>
                    <th className="text-left font-medium py-2 pr-4">Purpose</th>
                    <th className="text-left font-medium py-2">Duration</th>
                  </tr>
                </thead>
                <tbody className="text-surface-600">
                  <tr className="border-b border-surface-200/30">
                    <td className="py-2 pr-4 font-mono text-xs">_ga</td>
                    <td className="py-2 pr-4">Distinguishes unique users for Google Analytics</td>
                    <td className="py-2">2 years</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-xs">_ga_*</td>
                    <td className="py-2 pr-4">Maintains session state for Google Analytics</td>
                    <td className="py-2">2 years</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-base font-medium text-surface-800 mt-4 mb-2">
              7.3 Marketing Cookies
            </h3>
            <p>Used to deliver relevant content and measure campaign effectiveness. Only set with your explicit consent.</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-surface-200/50">
                    <th className="text-left font-medium py-2 pr-4">Cookie</th>
                    <th className="text-left font-medium py-2 pr-4">Purpose</th>
                    <th className="text-left font-medium py-2">Duration</th>
                  </tr>
                </thead>
                <tbody className="text-surface-600">
                  <tr className="border-b border-surface-200/30">
                    <td className="py-2 pr-4 font-mono text-xs">_fbp</td>
                    <td className="py-2 pr-4">Identifies browsers for Facebook ad delivery</td>
                    <td className="py-2">3 months</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-xs">_gcl_au</td>
                    <td className="py-2 pr-4">Stores ad click info for Google Ads conversion tracking</td>
                    <td className="py-2">3 months</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-3">
              You can manage your cookie preferences at any time through the
              cookie consent banner or your browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              8. Your Rights
            </h2>

            <h3 className="text-base font-medium text-surface-800 mt-4 mb-2">
              8.1 GDPR Rights (EU/EEA Users)
            </h3>
            <p>If you are in the EU/EEA, you have the right to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Access, correct, or delete your personal data.</li>
              <li>Restrict or object to processing.</li>
              <li>Data portability (export your data in a structured format).</li>
              <li>Withdraw consent at any time.</li>
              <li>Lodge a complaint with your local data protection authority.</li>
            </ul>

            <h3 className="text-base font-medium text-surface-800 mt-4 mb-2">
              8.2 CCPA Rights (California Residents)
            </h3>
            <p>If you are a California resident, you have the right to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Know what personal information is collected and how it is used.</li>
              <li>Request deletion of your personal information.</li>
              <li>Opt out of the sale of personal information (we do not sell your data).</li>
              <li>Non-discrimination for exercising your rights.</li>
            </ul>

            <p className="mt-3">
              To exercise any of these rights, contact us at{" "}
              <a
                href="mailto:privacy@burnless.com"
                className="text-brand-600 hover:text-brand-700 underline underline-offset-2"
              >
                privacy@burnless.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              9. International Data Transfers
            </h2>
            <p>
              Your data may be transferred to and processed in countries other
              than your country of residence. We ensure appropriate safeguards
              are in place, including Standard Contractual Clauses approved by
              the European Commission, when transferring data internationally.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              10. Children&apos;s Privacy
            </h2>
            <p>
              The Service is not intended for individuals under 16 years of age.
              We do not knowingly collect personal information from children. If
              we learn that we have collected data from a child, we will delete
              it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              11. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will
              notify you of material changes by posting the updated policy on
              this page and updating the &quot;Last updated&quot; date. For
              significant changes, we may also notify you via email.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              12. Contact Us
            </h2>
            <p>
              If you have questions about this Privacy Policy or wish to
              exercise your rights, contact us at:
            </p>
            <div className="mt-3 p-4 rounded-lg bg-surface-50 border border-surface-200/50">
              <p className="font-medium text-surface-900">Burnless, Inc.</p>
              <p className="mt-1">
                Email:{" "}
                <a
                  href="mailto:privacy@burnless.com"
                  className="text-brand-600 hover:text-brand-700 underline underline-offset-2"
                >
                  privacy@burnless.com
                </a>
              </p>
            </div>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
