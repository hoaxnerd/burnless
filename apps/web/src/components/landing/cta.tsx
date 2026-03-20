"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useInView } from "./use-in-view";

export function CTASection() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-24 sm:py-32 relative overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full opacity-20 blur-[120px]"
          style={{ background: "radial-gradient(circle, #2563eb 0%, transparent 70%)" }}
        />
      </div>

      <div
        className={`relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center transition-all duration-700 ${
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <h2 className="text-3xl sm:text-5xl font-bold text-surface-900 tracking-tight leading-tight">
          Ready to stop
          <br />
          <span className="bg-gradient-to-r from-brand-400 to-brand-600 bg-clip-text text-transparent">
            guessing your runway?
          </span>
        </h2>
        <p className="mt-6 text-lg text-surface-500 max-w-xl mx-auto">
          Join founders who replaced spreadsheet anxiety with financial clarity.
          Free to start, no credit card required.
        </p>
        <div className="mt-10">
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
  );
}
