import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Security — burnless",
  description:
    "Learn about burnless security practices, data protection, and compliance commitments.",
};

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-surface-0">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <h1 className="text-3xl sm:text-4xl font-bold text-surface-900 mb-2">
          Security
        </h1>
        <p className="text-lg text-surface-500 mb-12 max-w-xl">
          Your financial data is sensitive. We treat it that way.
        </p>

        <div className="space-y-8 text-surface-600 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              Infrastructure
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-surface-800">Encryption in transit:</strong>{" "}
                All data is transmitted over TLS 1.3. We enforce HTTPS on every
                connection.
              </li>
              <li>
                <strong className="text-surface-800">Encryption at rest:</strong>{" "}
                Data is encrypted using AES-256 at the database and storage
                layer.
              </li>
              <li>
                <strong className="text-surface-800">Cloud hosting:</strong>{" "}
                Hosted on SOC 2 Type II certified infrastructure with
                redundancy and automated backups.
              </li>
              <li>
                <strong className="text-surface-800">Network isolation:</strong>{" "}
                Application services run in isolated virtual networks with
                strict firewall rules.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              Application Security
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-surface-800">Authentication:</strong>{" "}
                Secure credential hashing (bcrypt), OAuth 2.0 support (Google,
                GitHub), and CSRF protection on all forms.
              </li>
              <li>
                <strong className="text-surface-800">Authorization:</strong>{" "}
                Role-based access controls ensure users only access their own
                data.
              </li>
              <li>
                <strong className="text-surface-800">Rate limiting:</strong>{" "}
                API endpoints are rate-limited to prevent abuse and
                brute-force attacks.
              </li>
              <li>
                <strong className="text-surface-800">Input validation:</strong>{" "}
                All user inputs are validated and sanitized to prevent
                injection attacks.
              </li>
              <li>
                <strong className="text-surface-800">Dependency management:</strong>{" "}
                Automated vulnerability scanning of all dependencies with
                prompt patching.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              Data Protection
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-surface-800">Data isolation:</strong>{" "}
                Each company&apos;s data is logically isolated. There is no
                cross-tenant data access.
              </li>
              <li>
                <strong className="text-surface-800">Backups:</strong>{" "}
                Automated daily backups with point-in-time recovery. Backups are
                encrypted and stored in a separate region.
              </li>
              <li>
                <strong className="text-surface-800">Data deletion:</strong>{" "}
                Account deletion removes all personal and financial data within
                30 days.
              </li>
              <li>
                <strong className="text-surface-800">AI data handling:</strong>{" "}
                Your financial data is not used to train AI models. AI
                processing occurs on our secure servers — data is never sent to
                third-party model providers without your explicit consent.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              Compliance
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-surface-800">SOC 2:</strong>{" "}
                Working toward SOC 2 Type II certification. Our infrastructure
                providers are SOC 2 certified.
              </li>
              <li>
                <strong className="text-surface-800">GDPR:</strong>{" "}
                We support data subject rights including access, correction,
                deletion, and portability.
              </li>
              <li>
                <strong className="text-surface-800">CCPA:</strong>{" "}
                California residents can exercise their privacy rights as
                described in our{" "}
                <a
                  href="/privacy"
                  className="text-brand-600 hover:text-brand-700 underline underline-offset-2"
                >
                  Privacy Policy
                </a>
                .
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              Responsible Disclosure
            </h2>
            <p>
              If you discover a security vulnerability, please report it
              responsibly. Contact us at{" "}
              <a
                href="mailto:security@burnless.com"
                className="text-brand-600 hover:text-brand-700 underline underline-offset-2"
              >
                security@burnless.com
              </a>
              . We take all reports seriously and will respond within 48 hours.
              Please do not publicly disclose the vulnerability until we have
              had a chance to investigate and address it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              Questions?
            </h2>
            <p>
              For security-related inquiries, contact{" "}
              <a
                href="mailto:security@burnless.com"
                className="text-brand-600 hover:text-brand-700 underline underline-offset-2"
              >
                security@burnless.com
              </a>
              . For general support, reach us at{" "}
              <a
                href="mailto:support@burnless.com"
                className="text-brand-600 hover:text-brand-700 underline underline-offset-2"
              >
                support@burnless.com
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
