/**
 * AI-01: resolve the WRITE target for an AI chat turn.
 *
 * Only an explicitly-selected, company-validated scenario is a write target. In
 * base view (no scenario selected, or an id that did not resolve to this company's
 * scenario) the AI writes to BASE tables, so the target is null — NOT the
 * Base-Case overlay (which is only the READ-context fallback). Keeping these two
 * concepts separate is the whole fix: the resolved `scenario` drives the financial
 * snapshot; this drives where mutations land.
 */
export function resolveWriteScenarioId(
  bodyScenarioId: string | null | undefined,
  validated: { id: string } | null | undefined,
): string | null {
  if (!bodyScenarioId) return null;
  return validated ? validated.id : null;
}
