"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

/* Closing CTA — a single confident brand band. One action, no invented proof
   bar, no fake demo button. brand-600 is stable across light/dark, so the band
   reads the same in both themes. */

export function CTASection() {
  return (
    <section className="px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl bg-brand-600 px-6 py-16 text-center sm:px-12 sm:py-20">
        <h2 className="mx-auto max-w-2xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
          Ready for finances that think ahead?
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-brand-100">
          Trade spreadsheet anxiety for financial intelligence. Free to start, no credit
          card required.
        </p>

        <div className="mt-9 flex justify-center">
          <Link
            href="/login"
            onClick={() => trackEvent("landing_cta_signup_clicked")}
            className="press-effect group inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-white px-8 py-4 text-base font-semibold text-brand-700 shadow-md transition-colors hover:bg-brand-50"
          >
            Start free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
