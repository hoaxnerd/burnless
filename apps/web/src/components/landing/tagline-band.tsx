import { Clock } from "lucide-react";

/* 3 · TAGLINE BAND — a centered breath between the dashboard preview and the
   editions/CTA. Static (server-renderable): no hooks, no gating. The section
   carries id="companion" so the nav's "/#companion" anchor lands here. */

export function TaglineBand() {
  return (
    <section
      id="companion"
      className="mx-auto max-w-[760px] px-4 pb-6 pt-12 text-center sm:px-6 sm:pb-10 sm:pt-20 lg:px-8"
    >
      <span className="inline-flex items-center gap-2 rounded-full border border-accent-200 bg-accent-50 px-[0.8rem] py-[0.4rem] font-mono text-[0.74rem] font-medium uppercase tracking-[0.04em] text-accent-600">
        <Clock className="h-[13px] w-[13px]" />
        Always watching
      </span>
      <h2 className="mx-0 mt-[1.1rem] text-[clamp(1.9rem,3.4vw+0.5rem,3.1rem)] font-extrabold leading-[1.06] tracking-[-0.035em] [overflow-wrap:anywhere]">
        And it never looks away from your <span className="text-accent-600">numbers.</span>
      </h2>
      <p className="mx-auto mt-[1.1rem] max-w-[560px] text-[clamp(1rem,1vw+0.6rem,1.16rem)] leading-relaxed text-surface-600">
        Every figure stays current. The moment something moves — burn, runway, a spend anomaly —
        it&apos;s on your dashboard and flagged, before it becomes a problem.
      </p>
    </section>
  );
}
