import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Help & FAQ — burnless",
  description:
    "Find answers to common questions about burnless, your AI-powered financial planning platform.",
};

const faqs = [
  {
    question: "What is burnless?",
    answer:
      "burnless is an AI-powered financial planning platform built for startups. It helps you track expenses, monitor your burn rate, forecast runway, model scenarios, and generate investor-ready reports — all in one place.",
  },
  {
    question: "How does the companion work?",
    answer:
      "The companion analyzes your financial data to surface insights, categorize transactions, and suggest optimizations. It can answer questions about your finances in natural language. Your data is processed securely and is never used to train AI models.",
  },
  {
    question: "Is my financial data secure?",
    answer:
      "Yes. We use industry-standard encryption (TLS 1.3 in transit, AES-256 at rest), logical data isolation between companies, and automated backups. See our Security page for full details.",
  },
  {
    question: "Can I import data from spreadsheets?",
    answer:
      "Yes. burnless supports CSV import for expenses, revenue, and other financial data. We also support direct integrations with popular accounting and banking tools.",
  },
  {
    question: "What reports can I generate?",
    answer:
      "You can generate profit & loss statements, cash flow reports, balance sheets, runway analyses, key metrics dashboards, and board update summaries — all from your dashboard.",
  },
  {
    question: "How does scenario planning work?",
    answer:
      "Scenario planning lets you model different financial futures — for example, 'What if we hire 3 more engineers?' or 'What if revenue grows 20% next quarter?' You can compare scenarios side by side to make better decisions.",
  },
  {
    question: "Is there a free plan?",
    answer:
      "Yes. burnless offers a free tier with core financial tracking features. Paid plans unlock advanced AI features, more integrations, and team collaboration. See our Pricing page for details.",
  },
  {
    question: "Can my whole team use burnless?",
    answer:
      "Team plans with role-based access are coming soon, so founders, finance leads, and team members will each see what they need. Today, burnless supports a single workspace per account.",
  },
  {
    question: "How do I cancel my subscription?",
    answer:
      "You can cancel anytime from your account settings. Cancellation takes effect at the end of the current billing period. You won't be charged again after cancellation.",
  },
  {
    question: "How do I delete my account and data?",
    answer:
      "You can request account deletion from your settings page or by emailing privacy@burnless.com. We will delete all personal and financial data within 30 days.",
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-surface-0">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <h1 className="text-3xl sm:text-4xl font-bold text-surface-900 mb-2">
          Help &amp; FAQ
        </h1>
        <p className="text-lg text-surface-500 mb-12 max-w-xl">
          Quick answers to common questions. Can&apos;t find what you need?{" "}
          <Link
            href="/contact"
            className="text-brand-600 hover:text-brand-700 underline underline-offset-2"
          >
            Contact us
          </Link>
          .
        </p>

        <div className="space-y-6">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="rounded-xl border border-surface-200/30 bg-surface-50/50 p-6"
            >
              <h2 className="text-base font-semibold text-surface-900 mb-2">
                {faq.question}
              </h2>
              <p className="text-sm text-surface-600 leading-relaxed">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>

        {/* Still need help */}
        <div className="mt-12 rounded-xl border border-brand-200/30 bg-brand-50/30 p-6 text-center">
          <h2 className="text-lg font-semibold text-surface-900 mb-2">
            Still have questions?
          </h2>
          <p className="text-sm text-surface-600 mb-4">
            Our team is here to help. Reach out and we&apos;ll get back to you
            within one business day.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            Contact Support
          </Link>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
