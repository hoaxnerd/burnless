import {
  ArrowRightLeft,
  FolderGit2,
  GitFork,
  Plug,
  Scale,
  ShieldCheck,
  Star,
} from "lucide-react";
import { GITHUB_REPO_URL } from "@/lib/public-repo";
import { CopyButton } from "./copy-button";

/* Section 5 — OPEN-SOURCE BAND (dark repo zone).
   This band stays DARK in BOTH light and dark mode: it intentionally uses the
   mockup's literal dark colors (arbitrary Tailwind values) rather than the
   semantic surface-* tokens, which would flip with the theme. Background
   radial+linear gradients and the faint grid overlay are inlined to mirror
   `.os` and `.os::before` from the approved mockup. The install-terminal
   header uses <CopyButton> as a client island — it copies the install command. */

const features = [
  {
    Icon: ArrowRightLeft,
    title: "Truly self-hosted",
    body: (
      <>
        One command, an <b className="font-semibold text-[#c7d0e4]">embedded database</b>, and{" "}
        <b className="font-semibold text-[#c7d0e4]">no Docker</b>. It boots a full instance on{" "}
        <code className="rounded-[5px] bg-[rgba(255,255,255,0.05)] px-[0.35rem] py-[0.05rem] font-mono text-[0.82rem] text-[#c4b5fd]">
          :2876
        </code>{" "}
        in seconds — laptop, VPS, or air-gapped box.
      </>
    ),
  },
  {
    Icon: ShieldCheck,
    title: "Your data never leaves",
    body: (
      <>
        Financials stay on <b className="font-semibold text-[#c7d0e4]">your</b> machine. Point the
        AI at your own provider key — Anthropic, OpenAI, OpenRouter — or a{" "}
        <b className="font-semibold text-[#c7d0e4]">local model</b> via Ollama. Nothing phones home.
      </>
    ),
  },
  {
    Icon: Scale,
    title: "Licensed to last",
    body: (
      <>
        <b className="font-semibold text-[#c7d0e4]">AGPL-3.0</b> for the platform,{" "}
        <b className="font-semibold text-[#c7d0e4]">Apache-2.0</b> for the CLI. Fork it, audit it,
        run it forever — no seat caps, no rug-pull.
      </>
    ),
  },
  {
    Icon: Plug,
    title: "Built to extend",
    body: (
      <>
        Connect <b className="font-semibold text-[#c7d0e4]">any MCP server</b>, or expose burnless{" "}
        <b className="font-semibold text-[#c7d0e4]">as</b> one. Add your own tools and the AI
        companion, the CLI, and scheduled jobs all pick them up.
      </>
    ),
  },
];

export function OpenSourceBand() {
  return (
    <section
      id="open-source"
      className="relative mt-[clamp(1rem,3vw,2rem)] overflow-hidden text-[#c7d0e4]"
      style={{
        background:
          "radial-gradient(80% 120% at 85% 0%,rgba(124,58,237,.16),transparent 60%),radial-gradient(70% 100% at 10% 100%,rgba(37,99,235,.16),transparent 60%),linear-gradient(180deg,#0b1020,#0a0e1a)",
      }}
    >
      {/* Faint grid overlay (mirrors .os::before) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px)",
          backgroundSize: "60px 60px",
          WebkitMaskImage: "radial-gradient(100% 80% at 50% 0%,#000,transparent 75%)",
          maskImage: "radial-gradient(100% 80% at 50% 0%,#000,transparent 75%)",
        }}
      />

      <div className="relative mx-auto max-w-[1180px] px-[clamp(1rem,4vw,2.5rem)] py-[clamp(3.5rem,7vw,6rem)]">
        <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.03)] px-[0.8rem] py-[0.4rem] font-mono text-[0.74rem] font-medium uppercase tracking-[0.04em] text-[#c4b5fd]">
          <span className="h-[6px] w-[6px] rounded-full bg-[#10b981] shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" />
          Open source
        </span>

        <h2 className="mt-4 text-[clamp(1.7rem,2.4vw+0.7rem,2.5rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-[#f4f7ff] [overflow-wrap:anywhere]">
          Yours to run, read, and <span className="text-[#a78bfa]">reshape.</span>
        </h2>
        <p className="mt-[0.7rem] text-base text-[#9aa6c2]">No black box. No lock-in.</p>

        <div className="mt-[clamp(2.2rem,4vw,3rem)] grid grid-cols-1 items-start gap-[clamp(2rem,4vw,3rem)] lg:grid-cols-[1.05fr_0.95fr] lg:gap-[clamp(2.5rem,4vw,4rem)]">
          {/* Feature pillars */}
          <div className="flex flex-col gap-[1.3rem]">
            {features.map(({ Icon, title, body }) => (
              <div key={title} className="flex items-start gap-[0.9rem]">
                <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[12px] border border-[rgba(255,255,255,0.14)] bg-[rgba(124,58,237,0.12)] text-[#c4b5fd]">
                  <Icon className="h-[19px] w-[19px]" strokeWidth={2} />
                </span>
                <div>
                  <div className="text-[1.02rem] font-bold tracking-[-0.01em] text-[#f4f7ff]">
                    {title}
                  </div>
                  <p className="mt-[0.25rem] text-[0.9rem] leading-[1.55] text-[#9aa6c2]">{body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Repo card + install terminal */}
          <div className="flex flex-col gap-4">
            <div className="rounded-[16px] border border-[rgba(255,255,255,0.14)] bg-[linear-gradient(180deg,#151d31,#0f1626)] p-[1.1rem_1.2rem] shadow-[0_24px_50px_-20px_rgba(0,0,0,0.6)]">
              <div className="flex flex-wrap items-center gap-2 text-base">
                <FolderGit2 className="h-[18px] w-[18px] text-[#6b7794]" strokeWidth={2} />
                <span className="text-[#9aa6c2]">hoaxnerd /</span>
                <span className="font-bold text-[#93c5fd]">burnless</span>
                <span className="ml-[0.4rem] rounded-full border border-[rgba(255,255,255,0.14)] px-[0.5rem] py-[0.1rem] text-[0.66rem] font-semibold text-[#6b7794]">
                  Public
                </span>
              </div>
              <p className="mt-[0.7rem] text-[0.86rem] leading-[1.5] text-[#9aa6c2]">
                Open-source, AI-native financial planning &amp; analysis for startups. Forecasts,
                scenarios, board reports — and an AI companion that takes action on your model.
              </p>
              <div className="mt-[0.9rem] flex flex-wrap gap-[1.1rem] text-[0.78rem] text-[#6b7794]">
                <span className="inline-flex items-center gap-[0.4rem]">
                  <i className="inline-block h-[10px] w-[10px] rounded-full bg-[#3178c6]" />
                  TypeScript
                </span>
                <span className="inline-flex items-center gap-[0.4rem]">
                  <Scale className="h-[14px] w-[14px]" strokeWidth={2} />
                  AGPL-3.0
                </span>
                <span className="inline-flex items-center gap-[0.4rem]">
                  <GitFork className="h-[14px] w-[14px]" strokeWidth={2} />
                  Fork
                </span>
              </div>
              <div className="mt-[1.1rem] flex flex-wrap gap-[0.6rem]">
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-[0.45rem] rounded-[10px] border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.06)] px-[0.9rem] py-[0.55rem] text-[0.85rem] font-semibold text-[#f4f7ff] transition-colors hover:bg-[rgba(255,255,255,0.12)]"
                >
                  <Star className="h-[15px] w-[15px] fill-[#e3b341] text-[#e3b341]" />
                  Star on GitHub
                </a>
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-[0.45rem] rounded-[10px] border border-[rgba(255,255,255,0.14)] bg-transparent px-[0.9rem] py-[0.55rem] text-[0.85rem] font-semibold text-[#c7d0e4] transition-colors hover:border-[#6b7794] hover:text-[#f4f7ff]"
                >
                  Read the docs
                </a>
              </div>
            </div>

            {/* Install terminal */}
            <div className="overflow-hidden rounded-[14px] border border-[rgba(255,255,255,0.14)] bg-[#070b14]">
              <div className="flex items-center gap-2 border-b border-[rgba(255,255,255,0.09)] px-[0.85rem] py-[0.55rem]">
                <span className="font-mono text-[0.68rem] text-[#6b7794]">install.sh</span>
                <CopyButton
                  command="curl -fsSL burnless.ai/install | sh"
                  className="ml-auto cursor-pointer rounded-[7px] border border-[rgba(255,255,255,0.14)] px-[0.45rem] py-[0.2rem] font-mono text-[0.66rem] text-[#9aa6c2] transition-colors hover:border-[rgba(255,255,255,0.3)] hover:text-[#f4f7ff]"
                />
              </div>
              <div className="overflow-x-auto px-4 py-[0.9rem] font-mono text-[0.8rem] leading-[1.85] text-[#c7d0e4]">
                <div className="whitespace-nowrap">
                  <span className="text-[#a78bfa]">$</span> curl -fsSL burnless.ai/install | sh
                </div>
                <div className="whitespace-nowrap">
                  <span className="text-[#6b7794]"># …or via npm</span>
                </div>
                <div className="whitespace-nowrap">
                  <span className="text-[#a78bfa]">$</span> npm i -g burnless &amp;&amp; burnless start
                </div>
                <div className="whitespace-nowrap">
                  <span className="text-[#34d399]">✓</span> running at http://localhost:2876
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
