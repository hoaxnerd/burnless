/**
 * Inline ANSI helpers — no chalk/ora dependency (spec C1). Color is decided PER CALL so
 * a `--no-color` flag (or NO_COLOR env) parsed after import still takes effect:
 *   override (set by the --no-color global) > NO_COLOR env off > TTY auto.
 */
let override: boolean | undefined;

/** Force color on/off; undefined restores auto-detect. Set by the --no-color global. */
export function setColorOverride(value: boolean | undefined): void {
  override = value;
}

function colorEnabled(): boolean {
  if (override !== undefined) return override;
  if (process.env.NO_COLOR !== undefined) return false;
  return process.stdout.isTTY === true;
}

const wrap =
  (open: string, close: string) =>
  (s: string): string =>
    colorEnabled() ? `\x1b[${open}m${s}\x1b[${close}m` : s;

export const bold = wrap("1", "22");
export const dim = wrap("2", "22");
export const red = wrap("31", "39");
export const green = wrap("32", "39");
export const yellow = wrap("33", "39");
