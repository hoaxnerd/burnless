/**
 * Preflight checks (spec §3). `doctor` = deep; `health` = quick liveness. Each check is
 * a {name, ok, detail}. No throwing — callers decide what's fatal.
 */
import { createServer } from "node:net";
import { resolveDriver } from "@burnless/db";
import { readInstanceEnv } from "./home";

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export function isPortFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

function nodeCheck(): CheckResult {
  const major = Number(process.versions.node.split(".")[0]);
  const ok = major >= 20;
  return { name: "node", ok, detail: `Node ${process.versions.node}${ok ? "" : " (need >= 20)"}` };
}

function keyCheck(home?: string): CheckResult {
  const present =
    (process.env.SECRETS_ENCRYPTION_KEY?.trim().length ?? 0) > 0 ||
    (readInstanceEnv(home).SECRETS_ENCRYPTION_KEY?.length ?? 0) > 0;
  return {
    name: "secrets_key",
    ok: present,
    detail: present ? "SECRETS_ENCRYPTION_KEY resolved" : "will be generated on first start",
  };
}

function driverCheck(): CheckResult {
  try {
    const r = resolveDriver(process.env);
    return {
      name: "db_driver",
      ok: true,
      detail: r.driver === "pglite" ? `PGLite @ ${r.dataDir}` : "Postgres (DATABASE_URL)",
    };
  } catch (e) {
    return { name: "db_driver", ok: false, detail: (e as Error).message };
  }
}

export interface PreflightOptions {
  port: number;
  host: string;
  home?: string;
}

export async function doctor(opts: PreflightOptions): Promise<CheckResult[]> {
  const free = await isPortFree(opts.port, opts.host);
  return [
    nodeCheck(),
    driverCheck(),
    keyCheck(opts.home),
    {
      name: "port",
      ok: free,
      detail: free ? `${opts.host}:${opts.port} is free` : `${opts.host}:${opts.port} is in use`,
    },
  ];
}

/** Quick subset for the `health` verb — driver + key (cheap, no port bind). */
export async function health(opts: { home?: string }): Promise<CheckResult[]> {
  return [driverCheck(), keyCheck(opts.home)];
}
