"use client";

import { useInView } from "./use-in-view";

const integrations = [
  { name: "QuickBooks", letters: "QB" },
  { name: "Xero", letters: "XE" },
  { name: "Plaid", letters: "PL" },
  { name: "Mercury", letters: "ME" },
  { name: "Stripe", letters: "ST" },
  { name: "Gusto", letters: "GU" },
  { name: "Brex", letters: "BX" },
  { name: "Ramp", letters: "RA" },
];

function LogoPill({ name, letters }: { name: string; letters: string }) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-surface-200/10 border border-surface-200/15 shrink-0 transition-all duration-300 hover:bg-surface-200/20 hover:border-surface-200/30">
      <div className="w-7 h-7 rounded-md bg-surface-200/20 flex items-center justify-center text-xs font-bold text-surface-500 font-mono">
        {letters}
      </div>
      <span className="text-sm font-medium text-surface-500 whitespace-nowrap">{name}</span>
    </div>
  );
}

export function SocialProofBar() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="relative py-16 border-y border-surface-200/20 overflow-hidden">
      <div
        className={`text-center mb-8 transition-all duration-700 ${
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        <p className="text-sm font-medium uppercase tracking-wider text-surface-500">
          Connects with the tools you already use
        </p>
      </div>

      {/* Infinite scroll logos */}
      <div className="relative">
        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-surface-0 to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-surface-0 to-transparent z-10" />

        <div
          className="flex gap-4"
          style={{
            animation: inView ? "logoScroll 30s linear infinite" : "none",
            width: "max-content",
          }}
        >
          {/* Double the logos for seamless loop */}
          {[...integrations, ...integrations].map((logo, i) => (
            <LogoPill key={`${logo.name}-${i}`} name={logo.name} letters={logo.letters} />
          ))}
        </div>
      </div>
    </section>
  );
}
