/**
 * Date string validation for API route parameters.
 *
 * Validates YYYY-MM format strings used by metrics, statements,
 * and other financial data endpoints.
 */

const YYYY_MM_RE = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const ISO_DATE_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

/**
 * Validate a YYYY-MM string. Returns parsed year/month or null.
 */
export function parseYearMonth(
  value: string
): { year: number; month: number } | null {
  if (!YYYY_MM_RE.test(value)) return null;
  const [year, month] = value.split("-").map(Number) as [number, number];
  if (year < 1900 || year > 2100) return null;
  return { year, month };
}

/**
 * Validate and parse a date range from YYYY-MM strings.
 * Returns period start/end Date objects or an error message.
 */
export function parseDateRange(
  startStr: string,
  endStr: string
): { periodStart: Date; periodEnd: Date } | { error: string } {
  const start = parseYearMonth(startStr);
  if (!start) return { error: `Invalid startDate format: ${startStr}. Expected YYYY-MM.` };

  const end = parseYearMonth(endStr);
  if (!end) return { error: `Invalid endDate format: ${endStr}. Expected YYYY-MM.` };

  if (
    start.year > end.year ||
    (start.year === end.year && start.month > end.month)
  ) {
    return { error: "startDate must be before or equal to endDate." };
  }

  // Cap range at 10 years to prevent unbounded computation
  const monthSpan =
    (end.year - start.year) * 12 + (end.month - start.month) + 1;
  if (monthSpan > 120) {
    return { error: "Date range cannot exceed 10 years (120 months)." };
  }

  const periodStart = new Date(start.year, start.month - 1, 1);
  const periodEnd = new Date(end.year, end.month, 0); // day 0 = last day of target month

  return { periodStart, periodEnd };
}

/**
 * Validate an ISO date string (YYYY-MM-DD) for transaction filtering.
 * Returns a Date or null.
 */
export function parseISODate(value: string): Date | null {
  if (!ISO_DATE_RE.test(value)) return null;
  const d = new Date(value + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return d;
}
