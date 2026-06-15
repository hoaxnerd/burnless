/**
 * Interactive prompts that never crash headless (spec D5). confirm() uses clack when stdin
 * is a TTY, reattaches /dev/tty when launched from a pipe (the install.sh hand-off), and
 * returns the default when neither is available (CI/headless). withSpinner() = ora when a
 * TTY, plain logging otherwise. clack/ora are imported ONLY here + start.ts (kept out of the
 * thin bundle's eager graph via dynamic import).
 */
import { openSync, closeSync } from "node:fs";

/**
 * Whether /dev/tty can actually be OPENED. existsSync("/dev/tty") is TRUE even in containers /
 * CI / cron where there is no controlling terminal and open() fails with ENXIO — so we must
 * probe an actual open, else the install.sh `exec burnless` hand-off crashes on the open-browser
 * prompt with an unhandled 'error' event.
 */
function canOpenTty(): boolean {
  try {
    const fd = openSync("/dev/tty", "r");
    closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

export interface ConfirmCore {
  message: string;
  default: boolean;
  assumeYes?: boolean;
  stdinTTY: boolean;
  ttyAvailable: boolean;
  askClack: (message: string, dflt: boolean) => Promise<boolean>;
  askTty: (message: string, dflt: boolean) => Promise<boolean>;
}

/** Pure decision core (no I/O) — picks which prompt path to use. */
export async function resolveConfirm(o: ConfirmCore): Promise<boolean> {
  if (o.assumeYes) return true;
  if (o.stdinTTY) return o.askClack(o.message, o.default);
  if (o.ttyAvailable) return o.askTty(o.message, o.default);
  return o.default;
}

/** Read one y/n line from /dev/tty (used when stdin is the install pipe). */
async function askViaTty(message: string, dflt: boolean): Promise<boolean> {
  const { createInterface } = await import("node:readline");
  const { createReadStream, createWriteStream } = await import("node:fs");
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let input: ReturnType<typeof createReadStream> | undefined;
    let output: ReturnType<typeof createWriteStream> | undefined;
    let rl: ReturnType<typeof createInterface> | undefined;
    const finish = (v: boolean) => {
      if (settled) return;
      settled = true;
      try { rl?.close(); } catch { /* noop */ }
      try { input?.destroy(); } catch { /* noop */ }
      try { output?.end(); } catch { /* noop */ }
      resolve(v);
    };
    try {
      input = createReadStream("/dev/tty");
      output = createWriteStream("/dev/tty");
    } catch {
      return finish(dflt);
    }
    // /dev/tty can pass canOpenTty() yet still emit an async 'error' (e.g. ENXIO on a races /
    // detached terminal). Without these handlers it's an unhandled 'error' that crashes node.
    input.on("error", () => finish(dflt));
    output.on("error", () => { /* ignore write-side errors */ });
    rl = createInterface({ input, output });
    rl.on("error", () => finish(dflt));
    const suffix = dflt ? " (Y/n) " : " (y/N) ";
    rl.question(message + suffix, (a) => {
      const t = a.trim().toLowerCase();
      finish(t === "" ? dflt : t === "y" || t === "yes");
    });
  });
}

async function askViaClack(message: string, dflt: boolean): Promise<boolean> {
  const { confirm: clackConfirm, isCancel } = await import("@clack/prompts");
  const r = await clackConfirm({ message, initialValue: dflt });
  if (isCancel(r)) return dflt;
  return r === true;
}

export interface ConfirmOptions {
  message: string;
  default?: boolean;
  assumeYes?: boolean;
}

/** TTY-graceful yes/no. Never throws on a missing TTY. */
export async function confirm(o: ConfirmOptions): Promise<boolean> {
  return resolveConfirm({
    message: o.message,
    default: o.default ?? true,
    assumeYes: o.assumeYes,
    stdinTTY: process.stdin.isTTY === true,
    ttyAvailable: canOpenTty(),
    askClack: askViaClack,
    askTty: askViaTty,
  });
}

/** ora spinner when stdout is a TTY; plain start/finish logging otherwise. */
export async function withSpinner<T>(text: string, fn: () => Promise<T>): Promise<T> {
  if (process.stderr.isTTY !== true) {
    process.stderr.write(`${text}…\n`);
    return fn();
  }
  const { default: ora } = await import("ora");
  const spinner = ora({ text, stream: process.stderr }).start();
  try {
    const r = await fn();
    spinner.succeed();
    return r;
  } catch (e) {
    spinner.fail();
    throw e;
  }
}
