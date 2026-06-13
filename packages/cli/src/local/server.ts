/**
 * Spawn the Next standalone server (spec §3 `start`). The entry (`server.js`) is staged
 * by the fat-artifact packaging (a later plan); BURNLESS_SERVER_ENTRY points at it.
 * Next's standalone server reads PORT + HOSTNAME from env.
 */
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

export function resolveServerEntry(env: NodeJS.ProcessEnv = process.env): string | null {
  const entry = env.BURNLESS_SERVER_ENTRY?.trim();
  return entry && entry.length > 0 ? entry : null;
}

export interface StartServerOptions {
  entry: string;
  host: string;
  port: number;
  env: NodeJS.ProcessEnv;
  /** Node binary to exec the server with (artifact-managed runtime); defaults to this process's Node. */
  nodeBin?: string;
  spawnFn?: (cmd: string, args: string[], opts: SpawnOptions) => ChildProcess;
}

export function startServer(opts: StartServerOptions): ChildProcess {
  const doSpawn = opts.spawnFn ?? spawn;
  const nodeBin = opts.nodeBin ?? process.execPath;
  return doSpawn(nodeBin, [opts.entry], {
    stdio: "inherit",
    env: { ...opts.env, PORT: String(opts.port), HOSTNAME: opts.host },
  });
}
