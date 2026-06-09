"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, X, ArrowRight, HelpCircle } from "lucide-react";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";
import { useInView } from "@/components/landing/use-in-view";
import { getEnabledPlans, type PlanDefinition } from "@burnless/ai";

const comparisonFeatures = [
  { label: "Scenarios", key: "scenarios" as const, type: "text" },
  { label: "AI Financial Companion", key: "aiMessages" as const, type: "text" },
  { label: "Data Exports", key: "exports" as const, type: "text" },
  { label: "Bank Sync", key: "bankSync" as const, type: "boolean" },
  { label: "Financial Dashboards", key: "dashboards" as const, type: "boolean" },
  { label: "Reports", key: "reports" as const, type: "text" },
  { label: "Investor Data Room", key: "dataRoom" as const, type: "boolean" },
  { label: "Team Access", key: "teamAccess" as const, type: "boolean" },
  { label: "Custom Integrations", key: "customIntegrations" as const, type: "boolean" },
  { label: "Support", key: "support" as const, type: "text" },
];

const faqs = [
  {
    q: "Can I try Pro features before upgrading?",
    a: "Yes! Start on the Free plan and explore the platform. When you hit a limit, you'll see an upgrade prompt. No credit card required to start.",
  },
  {
    q: "What happens when I hit my Free plan limits?",
    a: "You'll get a friendly prompt to upgrade. Your data is never deleted — you just can't create new scenarios or use AI credits until the next billing cycle or until you upgrade.",
  },
  {
    q: "Can I switch plans or cancel anytime?",
    a: "Absolutely. Upgrade, downgrade, or cancel anytime. When you cancel, your plan stays active until the end of the billing period. No lock-in, no penalties.",
  },
  {
    q: "Is my financial data secure?",
    a: "Your data is encrypted with 256-bit SSL in transit and AES-256 at rest. We're SOC 2 ready and GDPR compliant. We never sell your data or share it with third parties.",
  },
  {
    q: "Do you support payment methods outside the US?",
    a: "We support all major credit cards globally. Additional payment methods and regional providers are coming soon.",
  },
  {
    q: "What's included in the AI Financial Companion?",
    a: "Our AI analyzes your financial data to surface insights, forecast runway, detect anomalies, and answer questions about your finances — like having a CFO on call 24/7.",
  },
  {
    q: "Can I add my team?",
    a: "Team collaboration is coming soon — Pro supports a single workspace today. We're building shared workspaces with role-based access for co-founders, finance leads, and advisors who need real-time visibility.",
  },
  {
    q: "How does billing work? When am I charged?",
    a: "You're charged at the start of each billing cycle — monthly or annually. Annual plans are billed upfront for the full year at a 17% discount. You can view invoices and manage your subscription anytime from Settings.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-surface-200/20 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left group"
      >
        <span className="text-base font-medium text-surface-900 pr-4">{q}</span>
        <span
          className={`text-surface-400 transition-transform duration-200 ${
            open ? "rotate-45" : ""
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? "max-h-48 pb-5" : "max-h-0"
        }`}
      >
        <p className="text-sm text-surface-500 leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const { ref: heroRef, inView: heroInView } = useInView();
  const { ref: tableRef, inView: tableInView } = useInView();
  const { ref: faqRef, inView: faqInView } = useInView();

  const plans = getEnabledPlans();

  return (
    <div className="min-h-screen bg-surface-0">
      <LandingNav />
      <main>
        {/* Hero */}
        <section ref={heroRef} className="pt-32 pb-16 sm:pt-40 sm:pb-20 relative overflow-hidden">
          <div className="absolute inset-0">
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] rounded-full opacity-15 blur-[120px]"
              style={{ background: "radial-gradient(circle, #2563eb 0%, transparent 70%)" }}
            />
          </div>

          <div
            className={`relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center transition-all duration-700 ${
              heroInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-surface-900 tracking-tight">
              Simple, transparent{" "}
              <span className="bg-gradient-to-r from-brand-400 to-brand-600 bg-clip-text text-transparent">
                pricing
              </span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-surface-500 max-w-2xl mx-auto">
              Start free, upgrade when you need more. No hidden fees, no surprises.
            </p>

            {/* Billing toggle */}
            <div className="mt-10 flex items-center justify-center gap-4">
              <span
                className={`text-sm font-medium transition-colors ${
                  !annual ? "text-surface-900" : "text-surface-500"
                }`}
              >
                Monthly
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={annual}
                onClick={() => setAnnual(!annual)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  annual ? "bg-brand-500" : "bg-surface-300"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                    annual ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span
                className={`text-sm font-medium transition-colors ${
                  annual ? "text-surface-900" : "text-surface-500"
                }`}
              >
                Annual
              </span>
              <span
                className={`text-xs font-semibold text-brand-500 bg-brand-500/10 rounded-full overflow-hidden transition-all duration-300 ${
                  annual ? "px-2.5 py-1 opacity-100 max-w-24" : "px-0 py-0 opacity-0 max-w-0"
                }`}
              >
                Save 17%
              </span>
            </div>
          </div>
        </section>

        {/* Pricing cards */}
        <section className="pb-20 sm:pb-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className={`grid grid-cols-1 gap-6 lg:gap-8 ${plans.length === 2 ? "md:grid-cols-2 max-w-4xl mx-auto" : "md:grid-cols-3"}`}>
              {plans.map((plan, i) => (
                <div
                  key={plan.name}
                  className={`relative rounded-2xl border p-8 flex flex-col h-full transition-all duration-500 ${
                    heroInView
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-8"
                  } ${
                    plan.highlight
                      ? "border-brand-500/50 bg-brand-500/[0.03] shadow-xl shadow-brand-500/10"
                      : "border-surface-200/30 bg-surface-50/5"
                  }`}
                  style={{ transitionDelay: `${i * 100 + 200}ms` }}
                >
                  {plan.badge && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="bg-brand-500 text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow-lg shadow-brand-500/25">
                        {plan.badge}
                      </span>
                    </div>
                  )}

                  {/* Fixed: name + description */}
                  <h3 className="text-lg font-semibold text-surface-900">{plan.name}</h3>
                  <p className="mt-2 text-sm text-surface-500 h-10">{plan.description}</p>

                  {/* Flexible: pricing adjusts to available space */}
                  <div key={annual ? "annual" : "monthly"} className="mt-6 flex-1 animate-fade-in">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-surface-900 tabular-nums">
                        ${annual ? plan.annualPrice : plan.monthlyPrice}
                      </span>
                      {plan.monthlyPrice > 0 && (
                        <span className="text-sm text-surface-500">/mo</span>
                      )}
                    </div>
                    {annual && plan.monthlyPrice > 0 && (
                      <p className="mt-1 text-xs text-surface-400">
                        Billed annually (${plan.annualPrice * 12}/yr)
                      </p>
                    )}
                  </div>

                  {/* Fixed: button + features pinned to bottom */}
                  <Link
                    href={plan.ctaHref}
                    className={`mt-8 flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all group ${
                      plan.highlight
                        ? "bg-brand-500 text-white hover:bg-brand-400 shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-0.5"
                        : "bg-surface-200/15 text-surface-900 border border-surface-200/30 hover:bg-surface-200/25 hover:border-surface-200/50"
                    }`}
                  >
                    {plan.cta}
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Link>

                  <ul className="mt-8 space-y-3.5">
                    {[plan.comparison.aiMessages, plan.comparison.scenarios].map((text) => (
                      <li key={text} className="flex items-start gap-3">
                        <Check className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
                        <span className="text-sm text-surface-700">{text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison table */}
        <section ref={tableRef} className="pb-20 sm:pb-28">
          <div
            className={`mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 transition-all duration-700 ${
              tableInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-surface-900 text-center mb-12">
              Compare plans
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-surface-200/30">
                    <th scope="col" className="py-4 pr-4 text-sm font-medium text-surface-500 w-1/3">Feature</th>
                    {plans.map((plan) => (
                      <th
                        key={plan.name}
                        scope="col"
                        className={`py-4 px-4 text-sm font-semibold text-center ${
                          plan.highlight ? "text-brand-500" : "text-surface-900"
                        }`}
                      >
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonFeatures.map((feature) => (
                    <tr key={feature.key} className="border-b border-surface-200/15">
                      <td className="py-4 pr-4 text-sm text-surface-700">{feature.label}</td>
                      {plans.map((plan) => {
                        const value = plan.comparison[feature.key];
                        return (
                          <td key={plan.name} className="py-4 px-4 text-center">
                            {typeof value === "boolean" ? (
                              value ? (
                                <Check className="w-4 h-4 text-brand-500 mx-auto" />
                              ) : (
                                <X className="w-4 h-4 text-surface-300 mx-auto" />
                              )
                            ) : (
                              <span className="text-sm text-surface-600">{value}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section ref={faqRef} className="pb-24 sm:pb-32">
          <div
            className={`mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 transition-all duration-700 ${
              faqInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 text-brand-500 mb-4">
                <HelpCircle className="w-5 h-5" />
                <span className="text-sm font-semibold uppercase tracking-wider">FAQ</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-surface-900">
                Frequently asked questions
              </h2>
            </div>

            <div className="rounded-2xl border border-surface-200/30 bg-surface-50/5 p-6 sm:p-8">
              {faqs.map((faq) => (
                <FAQItem key={faq.q} q={faq.q} a={faq.a} />
              ))}
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="pb-24 sm:pb-32 relative overflow-hidden">
          <div className="absolute inset-0">
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full opacity-15 blur-[120px]"
              style={{ background: "radial-gradient(circle, #2563eb 0%, transparent 70%)" }}
            />
          </div>
          <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight">
              Ready to take control of your{" "}
              <span className="bg-gradient-to-r from-brand-400 to-brand-600 bg-clip-text text-transparent">
                runway?
              </span>
            </h2>
            <p className="mt-4 text-lg text-surface-500">
              Start free. No credit card required.
            </p>
            <div className="mt-8">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-8 py-4 text-base font-semibold text-white hover:bg-brand-400 transition-all shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-0.5 group"
              >
                Start planning free
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
            <p className="mt-6 text-xs text-surface-500">
              256-bit encryption · SOC 2 ready · GDPR compliant
            </p>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
