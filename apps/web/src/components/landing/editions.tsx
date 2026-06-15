"use client";

import Link from "next/link";
import { Check, Circle, Github } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { useCapabilities } from "@/components/providers/capability-context";
import { GITHUB_REPO_URL } from "@/lib/public-repo";

/* 6 · EDITIONS — self-host vs cloud. Capability-gated: in holding mode
   (selfServeSignup off) the Cloud card reads "Coming soon" with a dead
   placeholder action; when self-serve signup turns on, the Cloud card flips to
   "Available" and the placeholder becomes a real "Start free" link. The
   Self-host card never changes. Mirrors the mockup's `.editions` section. */

const selfHostFeats = [
  "One-command install · no Docker · embedded database",
  "Your financials & AI keys never leave your infra",
  "Every feature, forever · AGPL-3.0",
  "Extend with any MCP server or your own tools",
];

const cloudFeats = [
  "Automatic updates & backups — nothing to maintain",
  "Managed AI — no provider keys to bring",
  "Hosted integrations & bank sync",
  "Priority support & SSO",
];

export function Editions() {
  const { selfServeSignup } = useCapabilities();

  return (
    <section className="mx-auto max-w-[1100px] px-4 pb-6 pt-16 sm:px-6 sm:pb-10 sm:pt-24 lg:px-8">
      <div className="mx-auto max-w-[640px] text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-surface-200 bg-surface-0/60 px-[0.8rem] py-[0.4rem] font-mono text-[0.74rem] font-medium uppercase tracking-[0.04em] text-surface-500">
          Editions
        </span>
        <h2 className="mt-[1rem] text-[clamp(1.9rem,3vw+0.6rem,2.9rem)] font-extrabold leading-[1.06] tracking-[-0.035em] [overflow-wrap:anywhere]">
          Run it yourself, free.{" "}
          <span className="text-brand-600">Cloud when you want it.</span>
        </h2>
        <p className="mx-auto mt-[1rem] max-w-[520px] text-[1.05rem] leading-relaxed text-surface-600">
          Same product, two ways to run it — start self-hosted today, managed cloud is on the way.
        </p>
      </div>

      <div className="mt-9 grid grid-cols-1 gap-[1.2rem] sm:mt-12 md:grid-cols-2">
        {/* Self-host card */}
        <div className="relative flex flex-col rounded-[22px] border border-brand-200 bg-surface-0 p-[1.4rem] shadow-[0_20px_40px_-16px_rgba(37,99,235,0.18)] sm:p-8">
          <span className="inline-flex items-center gap-[0.4rem] self-start rounded-full bg-success-50 px-[0.6rem] py-[0.28rem] text-[0.66rem] font-bold uppercase tracking-[0.07em] text-success-700">
            <span className="h-[6px] w-[6px] rounded-full bg-success-500" />
            Available now
          </span>
          <div className="mt-[0.9rem] text-[1.4rem] font-extrabold tracking-[-0.02em] text-surface-900">
            Self-host
          </div>
          <div className="mt-[0.2rem] text-[0.9rem] font-semibold text-surface-500">
            <b className="text-surface-900">Free</b> · open source
          </div>
          <p className="mt-[0.7rem] text-[0.92rem] leading-[1.55] text-surface-600">
            The complete platform on your own machine — your infra, your data, your AI keys.
          </p>
          <ul className="m-0 mt-[1.1rem] flex flex-1 list-none flex-col gap-[0.6rem] p-0">
            {selfHostFeats.map((feat) => (
              <li
                key={feat}
                className="flex items-start gap-[0.6rem] text-[0.88rem] leading-[1.45] text-surface-700"
              >
                <Check
                  className="mt-[0.1rem] h-4 w-4 flex-none text-success-500"
                  strokeWidth={2.4}
                />
                {feat}
              </li>
            ))}
          </ul>
          <div className="mt-[1.4rem]">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackEvent("landing_editions_github_clicked")}
              className="press-effect inline-flex items-center gap-[0.45rem] whitespace-nowrap rounded-xl bg-brand-600 px-[1.5rem] py-[0.85rem] text-base font-bold text-white shadow-[0_2px_8px_rgb(37_99_235/0.28)] transition-colors hover:bg-accent-600"
            >
              <Github className="h-[17px] w-[17px]" />
              Star on GitHub
            </a>
            <p className="mb-0 mt-[0.7rem] font-mono text-[0.74rem] text-surface-400">
              $ curl -fsSL burnless.ai/install | sh
            </p>
          </div>
        </div>

        {/* Cloud card */}
        <div className="relative flex flex-col rounded-[22px] border border-surface-200 bg-surface-50 p-[1.4rem] sm:p-8">
          {selfServeSignup ? (
            <span className="inline-flex items-center gap-[0.4rem] self-start rounded-full bg-success-50 px-[0.6rem] py-[0.28rem] text-[0.66rem] font-bold uppercase tracking-[0.07em] text-success-700">
              <span className="h-[6px] w-[6px] rounded-full bg-success-500" />
              Available
            </span>
          ) : (
            <span className="inline-flex items-center gap-[0.4rem] self-start rounded-full bg-surface-100 px-[0.6rem] py-[0.28rem] text-[0.66rem] font-bold uppercase tracking-[0.07em] text-surface-500">
              Coming soon
            </span>
          )}
          <div className="mt-[0.9rem] text-[1.4rem] font-extrabold tracking-[-0.02em] text-surface-900">
            Cloud
          </div>
          <div className="mt-[0.2rem] text-[0.9rem] font-semibold text-surface-500">
            Managed · hosted by us
          </div>
          <p className="mt-[0.7rem] text-[0.92rem] leading-[1.55] text-surface-600">
            The same app, zero-ops — we run it, scale it, and keep it backed up.
          </p>
          <ul className="m-0 mt-[1.1rem] flex flex-1 list-none flex-col gap-[0.6rem] p-0">
            {cloudFeats.map((feat) => (
              <li
                key={feat}
                className="flex items-start gap-[0.6rem] text-[0.88rem] leading-[1.45] text-surface-700"
              >
                <Circle className="mt-[0.1rem] h-4 w-4 flex-none text-surface-400" />
                {feat}
              </li>
            ))}
          </ul>
          <div className="mt-[1.4rem]">
            {selfServeSignup ? (
              <Link
                href="/login"
                onClick={() => trackEvent("landing_editions_cloud_signup_clicked")}
                className="press-effect inline-flex items-center gap-[0.45rem] whitespace-nowrap rounded-xl bg-brand-600 px-[1.5rem] py-[0.85rem] text-base font-bold text-white shadow-[0_2px_8px_rgb(37_99_235/0.28)] transition-colors hover:bg-accent-600"
              >
                Start free
              </Link>
            ) : (
              <span className="inline-flex cursor-default items-center gap-[0.45rem] rounded-xl border border-surface-200 bg-surface-100 px-[1.2rem] py-[0.7rem] text-[0.95rem] font-bold text-surface-500">
                Coming soon
              </span>
            )}
            <p className="mb-0 mt-[0.7rem] font-mono text-[0.74rem] text-surface-400">
              # launching the managed edition shortly
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
