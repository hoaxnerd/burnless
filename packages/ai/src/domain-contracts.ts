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
