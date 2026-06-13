import type { ConfigItemDescriptor } from "./config-item";
import { AiConfigStep } from "./steps/ai-config-step";

/**
 * The single `kind: "configuration"` descriptor instance the wizard reads (S4b).
 * This is the FIRST production consumer of {@link ConfigItemDescriptor}: page.tsx
 * derives the step's gate, stepper label, heading and render from THIS object —
 * not from inline literals — so the seam is load-bearing, and a future unified
 * config-control engine has a real instance to lift into a `ConfigItemDescriptor[]`
 * registry (move this file + config-item.ts to a shared `lib/config-engine/`).
 *
 * `hiddenWhenCapability: "managedAiProvider"` → the step is shown only when that
 * capability is OFF (self-host, BYO key); on cloud (providers managed) it is
 * hidden, mirroring the Settings → AI manager.
 *
 * NOTE on autofill: AI enrichment that produces the revenue/funding/expenses/team
 * suggestions runs UPFRONT at the website step (page.tsx `runEnrich`), before the
 * company exists and before this step. A provider configured here therefore powers
 * AI features generally (chat, insights, future sessions / a re-run) — it does NOT
 * retroactively re-feed the CURRENT session's already-streamed suggestions. The
 * description below is worded accordingly (it does not claim same-session autofill).
 */
const TITLE = "Connect your AI";
const DESCRIPTION = "Bring your own provider to power chat, insights and automations.";

export const aiConfigDescriptor: ConfigItemDescriptor = {
  id: "ai-config",
  kind: "configuration",
  title: TITLE,
  description: DESCRIPTION,
  hiddenWhenCapability: "managedAiProvider",
  skippable: true,
  render: (ref) => <AiConfigStep ref={ref} title={TITLE} description={DESCRIPTION} />,
};
