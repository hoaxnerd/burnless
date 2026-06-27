/**
 * Preflight checks (spec §3). `doctor` = deep; `health` = quick liveness. Each check is
 * a {name, ok, detail}. No throwing — callers decide what's fatal.
 */
import { createServer } from "node:net";
import { resolveDriver } from "@burnless/db";
import { UsageError } from "../errors";
import { readInstanceEnv } from "./home";

const MIN_NODE = [20, 9, 0] as const;

/** Hard-fail if the running Node is below the engines floor (20.9.0). The installer
 *  (P5) provisions/guides a suitable Node; this is the artifact-side backstop. */
export function assertNodeVersion(version: string = process.versions.node): void {
  const parts = version.split(".").map((n) => Number.parseInt(n, 10));
  const [maj = 0, min = 0, pat = 0] = parts;
  const ok =
    maj > MIN_NODE[0] ||
    (maj === MIN_NODE[0] && (min > MIN_NODE[1] || (min === MIN_NODE[1] && pat >= MIN_NODE[2])));
  if (!ok) {
    throw new UsageError(
      `burnless needs Node >= ${MIN_NODE.join(".")} but found ${version}.\n` +
        `Upgrade Node (e.g. via your version manager) and re-run.`,
    );
  }
}

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  /** When `false`, a failing (ok:false) check is informational — it is reported but does
   *  NOT make a doctor/health-probe run "fatal". Port contention and a not-yet-generated
   *  secrets key are surfaced but must never block the `update` post-swap gate (the old
   *  instance still holds the port during an update; the key is created on first start).
   *  `start` enforces the port independently — it must bind — so a busy port still blocks
   *  `start`. Defaults to fatal when omitted. */
  fatal?: boolean;
}

/** The post-swap gate's contract: a doctor/health run is "fatal" only when a check both
 *  failed and is not flagged `fatal:false`. The new fat-artifact is unhealthy only on real
 *  problems (node / db driver) — never on a busy port or a first-start-generated key. This
 *  is what `burnless update` execs (`doctor --json`) to decide keep-vs-rollback. */
export function hasFatalFailure(checks: CheckResult[]): boolean {
  return checks.some((c) => !c.ok && c.fatal !== false);
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
    // Non-fatal: an absent key is generated on first start, so it must not fail the
    // post-swap gate (mirrors `start`, which already excludes secrets_key from preflight).
    fatal: false,
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
      // Non-fatal for the health probe: during `update` the OLD instance still holds the
      // port, so a busy port is expected and must NOT trigger a rollback. `start` enforces
      // the port separately (it has to bind), so a busy port still blocks `start`.
      fatal: false,
      detail: free ? `${opts.host}:${opts.port} is free` : `${opts.host}:${opts.port} is in use`,
    },
  ];
}

/** Quick subset for the `health` verb — driver + key (cheap, no port bind). */
export async function health(opts: { home?: string }): Promise<CheckResult[]> {
  return [driverCheck(), keyCheck(opts.home)];
}
