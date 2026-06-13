import type { ReactNode, RefObject } from "react";
import type { Capability } from "@/lib/capabilities";
import type { WizardStepHandle } from "./types";

/** Discriminator the wizard uses to reason about a panel. */
export type WizardItemKind = "configuration" | "data";

/**
 * Declarative descriptor for a CONFIGURATION item. Shaped so a future unified
 * config-control engine can render the SAME descriptor in CLI / settings /
 * wizard. The wizard is the FIRST consumer; it only needs id/title/gate/render/
 * skippable today. Other surfaces (settings list, CLI prompt) read the same
 * fields. The engine is NOT built here — this is just the data shape.
 *
 * When the unified engine is built later, this file is the lift-and-shift
 * source: move `ConfigItemDescriptor` to a shared `lib/config-engine/` and add
 * a registry + per-surface renderers there.
 */
export interface ConfigItemDescriptor {
  /** Stable id, also the wizard step id (e.g. "ai-config"). */
  id: string;
  /** kind is always "configuration" for these; lets the wizard branch. */
  kind: "configuration";
  /** Short title for the stepper label + panel heading. */
  title: string;
  /** One-line description for the panel sub-header / CLI prompt text. */
  description: string;
  /**
   * Capability that must be OFF for this item to be relevant on this edition.
   * For AI provider config: "managedAiProvider" (OFF on self-host, ON on cloud
   * → item hidden). A future web/search/crawl config item names its own cap or
   * leaves it undefined (always shown).
   */
  hiddenWhenCapability?: Capability;
  /** Optional steps can be skipped without persisting work. */
  skippable: boolean;
  /**
   * Render the panel. Receives the step ref so the panel can expose the
   * WizardStepHandle (submit) contract — IDENTICAL to data steps, so the
   * wizard's Continue/Back/Skip dispatch is unchanged.
   */
  render: (ref: RefObject<WizardStepHandle | null>) => ReactNode;
}
