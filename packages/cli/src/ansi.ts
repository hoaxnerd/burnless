/**
 * Inline ANSI helpers — deliberately no chalk/ora dependency (spec C1: deps kept minimal).
 * Colors auto-disable when stdout is not a TTY or NO_COLOR is set, so piped/JSON
 * output and test assertions always see plain strings.
 */
const enabled = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;

const wrap =
  (open: string, close: string) =>
  (s: string): string =>
    enabled ? `[${open}m${s}[${close}m` : s;

export const bold = wrap("1", "22");
export const dim = wrap("2", "22");
export const red = wrap("31", "39");
export const green = wrap("32", "39");
export const yellow = wrap("33", "39");
