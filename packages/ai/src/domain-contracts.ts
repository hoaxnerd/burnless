/**
 * Domain leaf contracts (pure — no DB/Next/I/O).
 *
 * A1 introduces ContextSection: a heading + body block composed into the AI
 * system message. Future slices add the ContextContributor port, PromptSection,
 * and the DomainModule/DomainRegistry here (A3a) — keep this file pure.
 */

/** One composed block of the system message's context region. */
export interface ContextSection {
  /** Markdown H2 heading (rendered as `## {heading}`). */
  heading: string;
  /** Section body (markdown). */
  body: string;
  /** Ascending sort key for deterministic composition. Default 0; ties keep insertion order. */
  order?: number;
}

/** Heading for the legacy single finance-context block (back-compat wrap). Single source. */
export const DEFAULT_CONTEXT_HEADING = "Current Financial Data";

/**
 * An additional domain-specific section appended after the core system prompt.
 * Sorted by `order` (ascending, default 0) and joined by blank lines.
 */
export interface PromptSection {
  id: string;
  domain: string;
  body: string;
  order?: number;
}

/**
 * A contributor that produces context sections (e.g. financial snapshot) for
 * composition into the system message. Async — may hit DB/compute.
 */
export interface ContextContributor {
  id: string;
  domain: string;
  /** Returns the sections this contributor adds, or [] / null when there is nothing to add. */
  sections(ctx: ContributeCtx): Promise<ContextSection[]>;
}

/** Runtime context passed to a ContextContributor when building the system message. */
export interface ContributeCtx {
  companyId: string;
  scenarioId?: string | null;
  /**
   * Full scenario reference for contributors that need the scenario name/source
   * (e.g. the finance contributor passes these to buildAiContext). Optional so
   * callers that only have a scenarioId can omit this; contributors fall back to
   * safe defaults when absent.
   */
  scenarioRef?: { id: string; name: string; source: string };
}
