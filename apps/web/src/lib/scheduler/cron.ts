// apps/web/src/lib/scheduler/cron.ts
/**
 * Pure 5-field cron matcher (min hour dom month dow), evaluated in a given
 * IANA timezone, default UTC. Centralizes the logic that previously lived
 * only in scripts/cron-worker.ts so the scheduler core can evaluate a job's
 * schedule against "now". Day-of-week: 0/7 = Sunday, 1 = Monday.
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

const DOW_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function zonedParts(now: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false, weekday: "short",
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  const hour = parseInt(p.hour ?? "0", 10) % 24; // some engines emit "24" at midnight
  return {
    minute: parseInt(p.minute ?? "0", 10),
    hour,
    dom: parseInt(p.day ?? "1", 10),
    month: parseInt(p.month ?? "1", 10),
    dow: DOW_INDEX[p.weekday ?? "Sun"] ?? 0,
  };
}

export function cronMatches(expr: string, now: Date, timeZone = "UTC"): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [min, hour, dom, month, dow] = parts as [string, string, string, string, string];
  const t = zonedParts(now, timeZone);
  return (
    fieldMatches(min, t.minute) &&
    fieldMatches(hour, t.hour) &&
    fieldMatches(dom, t.dom) &&
    fieldMatches(month, t.month) &&
    (fieldMatches(dow, t.dow) || (t.dow === 0 && fieldMatches(dow, 7)))
  );
}
