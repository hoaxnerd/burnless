/**
 * Color helpers backed by picocolors (spec D3). Color is decided PER CALL so a `--no-color`
 * flag (or NO_COLOR env) parsed after import still takes effect:
 *   override (set by the --no-color global) > NO_COLOR env off > picocolors auto (TTY).
 */
import pc from "picocolors";

// Always-on color set: picocolors' default `pc.*` bind to its own TTY auto-detect at import,
// so they emit no codes in a non-TTY (and ignore a forced-on override). We gate color
// ourselves in `on()` per call, so we want the raw SGR-emitting functions unconditionally.
const c = pc.createColors(true);

let override: boolean | undefined;

/** Force color on/off; undefined restores auto-detect. Set by the --no-color global. */
export function setColorOverride(value: boolean | undefined): void {
  override = value;
}

function on(): boolean {
  if (override !== undefined) return override;
  if (process.env.NO_COLOR !== undefined) return false;
  return process.stdout.isTTY === true;
}

const wrap =
  (fn: (s: string) => string) =>
  (s: string): string =>
    on() ? fn(s) : s;

export const bold = wrap(c.bold);
export const dim = wrap(c.dim);
export const red = wrap(c.red);
export const green = wrap(c.green);
export const yellow = wrap(c.yellow);
