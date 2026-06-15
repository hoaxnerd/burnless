"use client";

import Link from "next/link";
import { Github } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { useCapabilities } from "@/components/providers/capability-context";
import { GITHUB_REPO_URL } from "@/lib/public-repo";

/* 7 · CLOSING — a single centered gradient card that closes the page. The
   radial-gradient wash is inlined (gradients can't be expressed cleanly as
   Tailwind utilities) over a surface-0 → surface-50 base; everything else is
   utility classes so the card flips with dark mode. Capability-gated: holding
   mode (selfServeSignup off) → "Star on GitHub"; self-serve on → "Start free".
   The ghost "Read the docs" link points at the repo, matching the OS band. */

export function CTASection() {
  const { selfServeSignup } = useCapabilities();

  return (
    <section className="mx-auto max-w-[920px] px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-16 lg:px-8">
      <div
        className="relative overflow-hidden rounded-[28px] border border-surface-200 bg-gradient-to-b from-surface-0 to-surface-50 px-[1.2rem] py-10 text-center shadow-[0_10px_15px_-3px_rgb(0_0_0/0.08),0_4px_6px_-4px_rgb(0_0_0/0.04)] sm:px-10 sm:py-16"
        style={{
          background:
            "radial-gradient(120% 140% at 50% 0%,rgba(124,58,237,.12),transparent 62%),linear-gradient(180deg,var(--color-surface-0),var(--color-surface-50))",
        }}
      >
        <h2 className="m-0 text-[clamp(2rem,3.4vw+0.6rem,3.1rem)] font-extrabold leading-[1.05] tracking-[-0.04em] [overflow-wrap:anywhere]">
          Know your runway{" "}
          <span className="text-brand-600">before you have to ask.</span>
        </h2>
        <p className="mx-auto mt-[1.1rem] max-w-[480px] text-[1.06rem] leading-relaxed text-surface-600">
          Open source and self-hostable in one command. Star the repo and follow along as it grows.
        </p>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {selfServeSignup ? (
            <Link
              href="/login"
              onClick={() => trackEvent("landing_cta_signup_clicked")}
              className="press-effect inline-flex items-center gap-[0.45rem] whitespace-nowrap rounded-xl bg-brand-600 px-[1.5rem] py-[0.85rem] text-base font-bold text-white shadow-[0_2px_8px_rgb(37_99_235/0.28)] transition-colors hover:bg-accent-600"
            >
              Start free
            </Link>
          ) : (
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackEvent("landing_cta_github_clicked")}
              className="press-effect inline-flex items-center gap-[0.45rem] whitespace-nowrap rounded-xl bg-brand-600 px-[1.5rem] py-[0.85rem] text-base font-bold text-white shadow-[0_2px_8px_rgb(37_99_235/0.28)] transition-colors hover:bg-accent-600"
            >
              <Github className="h-[17px] w-[17px]" />
              Star on GitHub
            </a>
          )}
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-[0.45rem] whitespace-nowrap rounded-xl border border-surface-300 bg-transparent px-[1.5rem] py-[0.85rem] text-base font-bold text-surface-700 transition-colors hover:border-surface-400 hover:bg-surface-50"
          >
            Read the docs
          </a>
        </div>
      </div>
    </section>
  );
}
