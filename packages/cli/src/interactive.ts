/**
 * Interactive prompts that never crash headless (spec D5). confirm() uses clack when stdin
 * is a TTY, reattaches /dev/tty when launched from a pipe (the install.sh hand-off), and
 * returns the default when neither is available (CI/headless). withSpinner() = ora when a
 * TTY, plain logging otherwise. clack/ora are imported ONLY here + start.ts (kept out of the
 * thin bundle's eager graph via dynamic import).
 */
import { existsSync } from "node:fs";

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
  const input = createReadStream("/dev/tty");
  const output = createWriteStream("/dev/tty");
  const suffix = dflt ? " (Y/n) " : " (y/N) ";
  return new Promise<boolean>((resolve) => {
    const rl = createInterface({ input, output });
    rl.question(message + suffix, (a) => {
      rl.close();
      input.close();
      output.end();
      const t = a.trim().toLowerCase();
      if (t === "") return resolve(dflt);
      resolve(t === "y" || t === "yes");
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
    ttyAvailable: existsSync("/dev/tty"),
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
