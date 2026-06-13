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
 * NOTE on autofill (two-phase order): on self-host this CONFIGURATION step is the
 * FIRST wizard step — it runs BEFORE the DATA phase (config → enrich → company →
 * revenue → …). The AI enrichment that produces the company/revenue/funding/
 * expenses/team suggestions is DEFERRED to run AFTER this step's Continue (page.tsx
 * `handleContinue` → `runEnrich("company")`, landing on the Company-claim step). So
 * the provider configured here is the one that powers the CURRENT session's
 * enrichment — the suggestions ARE AI-enriched same-session with the just-configured
 * provider, not only future sessions. (On cloud there is no ai-config step and
 * enrich runs upfront before the Company step.) The description below is worded
 * accordingly.
 */
const TITLE = "Connect your AI";
const DESCRIPTION =
  "Bring your own provider to power chat, insights and automations — we'll use it to enrich your setup next.";

export const aiConfigDescriptor: ConfigItemDescriptor = {
  id: "ai-config",
  kind: "configuration",
  title: TITLE,
  description: DESCRIPTION,
  hiddenWhenCapability: "managedAiProvider",
  skippable: true,
  render: (ref) => <AiConfigStep ref={ref} title={TITLE} description={DESCRIPTION} />,
};
