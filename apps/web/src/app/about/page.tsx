import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "About — burnless",
  description:
    "burnless is an AI-powered financial planning platform built for startups. Learn about our mission.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-surface-0">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <h1 className="text-3xl sm:text-4xl font-bold text-surface-900 mb-2">
          About burnless
        </h1>
        <p className="text-lg text-surface-500 mb-12 max-w-xl">
          Financial clarity for every startup, powered by AI.
        </p>

        <div className="space-y-8 text-surface-600 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              Our Mission
            </h2>
            <p>
              Startups fail when they run out of money — often without seeing it
              coming. burnless exists to change that. We give founders
              real-time financial visibility, AI-powered forecasting, and the
              tools to make confident decisions about their runway, revenue,
              and growth.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              The Problem
            </h2>
            <p>
              Most early-stage startups track finances in spreadsheets — or
              don&apos;t track them at all. By the time founders realize
              they&apos;re burning too fast, it&apos;s too late to course
              correct. Financial tools built for enterprises don&apos;t work for
              a 5-person team moving at startup speed.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              Our Approach
            </h2>
            <p>
              burnless is built specifically for startup founders and finance
              leads. We combine intuitive design with a companion that
              understands startup financial patterns — from burn rate
              optimization to fundraising runway modeling to scenario planning.
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>
                <strong className="text-surface-800">
                  Real-time financial dashboard
                </strong>{" "}
                — See your burn rate, runway, and cash position at a glance.
              </li>
              <li>
                <strong className="text-surface-800">
                  AI-powered insights
                </strong>{" "}
                — Get proactive alerts and recommendations tailored to your
                financial data.
              </li>
              <li>
                <strong className="text-surface-800">Scenario planning</strong>{" "}
                — Model different futures to make better decisions today.
              </li>
              <li>
                <strong className="text-surface-800">
                  Investor-ready reports
                </strong>{" "}
                — Generate board updates, P&amp;L statements, and runway
                analyses in one click.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              Built for Founders
            </h2>
            <p>
              We&apos;re a small, focused team that understands the startup
              experience firsthand. Every feature we build starts with one
              question: &quot;Does this help a founder make a better financial
              decision?&quot;
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-surface-900 mb-3">
              Get in Touch
            </h2>
            <p>
              Have questions or feedback? We&apos;d love to hear from you at{" "}
              <a
                href="mailto:hello@burnless.com"
                className="text-brand-600 hover:text-brand-700 underline underline-offset-2"
              >
                hello@burnless.com
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
