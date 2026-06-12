// apps/web/src/lib/scheduler/cron.ts
/**
 * Pure 5-field cron matcher (min hour dom month dow), UTC. Centralizes the
 * logic that previously lived only in scripts/cron-worker.ts so the scheduler
 * core can evaluate a job's schedule against "now". Day-of-week: 0/7 = Sunday,
 * 1 = Monday (matches Date.getUTCDay()).
 */
function fieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    return step > 0 && value % step === 0;
  }
  if (field.includes(",")) {
    return field.split(",").some((part) => fieldMatches(part, value));
  }
  if (field.includes("-")) {
    const [start, end] = field.split("-").map((n) => parseInt(n, 10)) as [number, number];
    return value >= start && value <= end;
  }
  return parseInt(field, 10) === value;
}

export function cronMatches(expr: string, now: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [min, hour, dom, month, dow] = parts as [string, string, string, string, string];
  const dowVal = now.getUTCDay(); // 0 = Sunday
  return (
    fieldMatches(min, now.getUTCMinutes()) &&
    fieldMatches(hour, now.getUTCHours()) &&
    fieldMatches(dom, now.getUTCDate()) &&
    fieldMatches(month, now.getUTCMonth() + 1) &&
    // accept both 0 and 7 for Sunday in the dow field
    (fieldMatches(dow, dowVal) || (dowVal === 0 && fieldMatches(dow, 7)))
  );
}
