import type { Alert, Severity } from "@burnless/engine";

const RANK: Record<Severity, number> = { info: 0, success: 1, warning: 2, error: 3 };

/**
 * Reduce a list of competitor alerts into a single digest notification payload.
 * The digest severity is the highest severity across all alerts.
 */
export function buildDigest(
  competitorName: string,
  alerts: Alert[],
): { title: string; body: string; severity: Severity } {
  const severity = alerts.reduce<Severity>(
    (acc, a) => (RANK[a.severity] > RANK[acc] ? a.severity : acc),
    "info",
  );
  const title = `${alerts.length} change${alerts.length === 1 ? "" : "s"} at ${competitorName}`;
  const body = alerts.map((a) => `• ${a.summary}`).join("\n");
  return { title, body, severity };
}
