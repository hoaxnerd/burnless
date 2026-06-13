/**
 * Secret input — masked TTY prompt OR `--stdin` pipe. Passwords are NEVER accepted as
 * positional args / flags (they'd leak into shell history + `ps`). (spec §3, P4 D9.)
 */
import { createInterface } from "node:readline";

export interface ReadSecretOptions {
  /** Read the whole secret from a piped stream (the --stdin path). */
  stdin?: boolean;
  /** Prompt label for the interactive path. */
  label?: string;
  /** Injectable input stream (defaults to process.stdin) — used by tests. */
  input?: NodeJS.ReadableStream;
}

export async function readSecret(opts: ReadSecretOptions = {}): Promise<string> {
  const input = opts.input ?? process.stdin;

  if (opts.stdin) {
    const chunks: Buffer[] = [];
    for await (const c of input) chunks.push(Buffer.from(c as Buffer));
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }

  // Interactive masked prompt: mute the echo so keystrokes aren't shown.
  return new Promise<string>((resolve) => {
    const rl = createInterface({ input: input as NodeJS.ReadableStream, output: process.stdout, terminal: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rl as any)._writeToOutput = () => {};
    rl.question(opts.label ?? "Password: ", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}
