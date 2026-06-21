"use client";

import Link from "next/link";
import { ArrowRight, Github } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { useCapabilities } from "@/components/providers/capability-context";
import { GITHUB_REPO_URL } from "@/lib/public-repo";
import { CompanionWindow } from "./companion-window";
import { CopyButton } from "./copy-button";

/* Split hero — the AI leads. Left: the promise + one-command install + CTAs.
   Right: the deep companion playing the full agentic worklog in an auto-scroll
   window. CTAs are capability-gated (holding mode → "Star on GitHub"). */

export function HeroSection() {
  const { selfServeSignup } = useCapabilities();

  return (
    <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-4 pb-12 pt-2 sm:px-6 sm:pb-16 lg:grid-cols-2 lg:gap-16 lg:px-10">
      {/* Type column */}
      <div>
        <span className="inline-flex items-center gap-2 rounded-full border border-surface-200 bg-surface-0/60 px-3 py-1.5 font-mono text-xs font-medium uppercase tracking-wide text-surface-500">
          <span className="h-1.5 w-1.5 rounded-full bg-success-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" />
          Open source &middot; Agentic FP&amp;A
        </span>

        <h1 className="mt-5 text-[clamp(2.5rem,3.6vw+1rem,4.4rem)] font-extrabold leading-[1.03] tracking-[-0.04em] text-surface-900 [overflow-wrap:anywhere]">
          The{" "}
          <span className="text-brand-600 underline decoration-brand-300 decoration-[3px] underline-offset-[6px]">
            always-on
          </span>{" "}
          financial companion.
        </h1>

        <p className="mt-5 max-w-[520px] text-[clamp(1.02rem,0.6vw+0.8rem,1.22rem)] leading-relaxed text-surface-600">
          burnless reads your real financials and watches burn, runway, and revenue in real time —
          then plans, acts, and shows you the change before anything is committed.{" "}
          <b className="font-semibold text-surface-800">Set it up with one command.</b>
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          {selfServeSignup ? (
            <Link
              href="/login"
              onClick={() => trackEvent("landing_hero_cta_clicked")}
              className="press-effect group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand-600 px-6 py-3.5 text-base font-bold text-white shadow-[0_2px_8px_rgb(37_99_235/0.28)] transition-colors hover:bg-accent-600"
            >
              Start free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackEvent("landing_hero_github_cta_clicked")}
              className="press-effect inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand-600 px-6 py-3.5 text-base font-bold text-white shadow-[0_2px_8px_rgb(37_99_235/0.28)] transition-colors hover:bg-accent-600"
            >
              <Github className="h-4 w-4" />
              Star on GitHub
            </a>
          )}
          <Link
            href="/#product"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-xl border border-surface-300 px-6 py-3.5 text-base font-medium text-surface-700 transition-colors hover:border-surface-400 hover:bg-surface-50"
          >
            See the dashboard ↓
          </Link>
        </div>

        {/* The one command */}
        <div className="mt-6 flex max-w-full items-center gap-3 overflow-x-auto rounded-xl bg-[#0d1424] py-2.5 pl-3.5 pr-2 shadow-md">
          <code className="whitespace-nowrap font-mono text-[0.82rem] text-[#c3cce0]">
            <span className="text-accent-400">$</span> curl -fsSL burnless.ai/install | sh
          </code>
          <CopyButton
            command="curl -fsSL burnless.ai/install | sh"
            className="ml-auto flex-none cursor-pointer rounded-lg border border-white/15 px-2 py-1.5 font-mono text-[0.7rem] text-[#9aa6c2] transition-colors hover:border-white/30 hover:text-white"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-surface-500">
          {["Embedded database", "No Docker", "Runs on :2876", "AGPL-3.0"].map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <span className="text-success-600">✓</span> {c}
            </span>
          ))}
        </div>
      </div>

      {/* Companion column */}
      <div>
        <CompanionWindow />
      </div>
    </section>
  );
}
