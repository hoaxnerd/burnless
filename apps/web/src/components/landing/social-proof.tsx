/* Integrations bar — honest social proof. No invented counters, no "trusted by
   N founders", no marquee. A calm static grid of the real tools burnless
   connects to. Export name kept (SocialProofBar) so page.tsx is unchanged. */

const integrations = [
  { name: "QuickBooks", letters: "QB", color: "#2CA01C" },
  { name: "Xero", letters: "XE", color: "#13B5EA" },
  { name: "Plaid", letters: "PL", color: "#111111" },
  { name: "Mercury", letters: "ME", color: "#5730EF" },
  { name: "Stripe", letters: "ST", color: "#635BFF" },
  { name: "Gusto", letters: "GU", color: "#F45D48" },
  { name: "Brex", letters: "BX", color: "#FF5733" },
  { name: "Ramp", letters: "RA", color: "#00C853" },
];

export function SocialProofBar() {
  return (
    <section className="border-y border-surface-200 bg-surface-50/60 py-14 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm text-surface-500">
          Connect your accounts and your numbers stay in sync — across the tools you
          already run on.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {integrations.map((tool) => (
            <div
              key={tool.name}
              className="flex items-center gap-2.5 rounded-xl border border-surface-200 bg-surface-0 px-4 py-3"
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold text-white"
                style={{ backgroundColor: tool.color }}
                aria-hidden="true"
              >
                {tool.letters}
              </span>
              <span className="text-sm font-medium text-surface-700">{tool.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
