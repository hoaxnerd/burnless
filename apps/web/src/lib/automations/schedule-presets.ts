/**
 * Friendly schedule presets ↔ UTC cron helpers (S3a Plan 4b §A5). Pure.
 *
 * v1 builds UTC crons: the editor exposes Daily / Weekly / Monthly + a
 * time-of-day (and weekday / day-of-month where relevant); everything is
 * interpreted in UTC for simplicity (the AI supplies tz-correct crons when it
 * proposes a job). A cron that doesn't match a known preset is "Custom".
 *
 * Cron field order: `minute hour day-of-month month day-of-week`.
 */

export type SchedulePreset =
  | { kind: "daily"; hour: number; minute: number }
  | { kind: "weekly"; hour: number; minute: number; weekday: number }
  | { kind: "monthly"; hour: number; minute: number; day: number };

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Compile a friendly preset to a 5-field UTC cron string. */
export function presetToCron(preset: SchedulePreset): string {
  const { minute, hour } = preset;
  switch (preset.kind) {
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly":
      return `${minute} ${hour} * * ${preset.weekday}`;
    case "monthly":
      return `${minute} ${hour} ${preset.day} * *`;
  }
}

/** Recognize a cron as a known preset; returns null for anything irregular ("Custom"). */
export function cronToPreset(cron: string): SchedulePreset | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hr, dom, mon, dow] = parts as [string, string, string, string, string];

  // minute + hour must be plain integers; month must be wildcard.
  if (!/^\d+$/.test(min) || !/^\d+$/.test(hr) || mon !== "*") return null;
  const minute = Number(min);
  const hour = Number(hr);
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;

  // daily: every day-of-month, every day-of-week.
  if (dom === "*" && dow === "*") return { kind: "daily", hour, minute };

  // weekly: a single weekday, every day-of-month.
  if (dom === "*" && /^\d+$/.test(dow)) {
    const weekday = Number(dow);
    if (weekday < 0 || weekday > 6) return null;
    return { kind: "weekly", hour, minute, weekday };
  }

  // monthly: a single day-of-month, every day-of-week.
  if (dow === "*" && /^\d+$/.test(dom)) {
    const day = Number(dom);
    if (day < 1 || day > 31) return null;
    return { kind: "monthly", hour, minute, day };
  }

  return null;
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Humanize a cron: a friendly sentence for a known preset, else `Custom (`<cron>`)`. */
export function describeCron(cron: string): string {
  const preset = cronToPreset(cron);
  if (!preset) return `Custom (${cron.trim()})`;
  const time = `${pad2(preset.hour)}:${pad2(preset.minute)} UTC`;
  switch (preset.kind) {
    case "daily":
      return `Every day at ${time}`;
    case "weekly":
      return `Every ${WEEKDAY_NAMES[preset.weekday]} at ${time}`;
    case "monthly":
      return `Monthly on the ${ordinal(preset.day)} at ${time}`;
  }
}
