/**
 * Browser-use via Playwright MCP (#33, S3a Plan 5 — Task C6).
 *
 * Full AI browser control is delivered NOT by a bespoke browser tool but by the
 * already-shipped MCP-consume feature: the user connects the upstream Playwright
 * MCP server (`npx @playwright/mcp@latest`, stdio) and the AI gets its whole
 * browser-control tool suite. This module is the SHARED BACKEND that:
 *   - offers a one-click recommended connection preset (RECOMMENDED_PLAYWRIGHT_MCP),
 *   - detects whether browser-use is actually usable (isBrowserUseAvailable),
 *   - installs the Chromium engine the Playwright MCP needs (installBrowserEngine).
 *
 * The "Web" category UI lands in S3b; the CLI verb in S5 — both consume this.
 * Browser-use is self-host only (the `stdioMcp` capability): cloud cannot spawn
 * local processes, and the Playwright MCP is a stdio server.
 */
import { homedir } from "node:os";
import path from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { listVisibleConnections } from "@burnless/db";
import { getCapabilities } from "@/lib/capabilities";

/**
 * One-click recommended Playwright MCP connection. The Connections UI (and
 * S3b's Web category) offers this as a preset; only surfaced when the
 * `stdioMcp` capability is on (self-host).
 */
export const RECOMMENDED_PLAYWRIGHT_MCP = {
  name: "Playwright (browser control)",
  slug: "playwright-browser-control",
  transport: "stdio" as const,
  command: "npx",
  args: ["@playwright/mcp@latest"],
  authType: "none" as const,
} as const;

export interface BrowserUseAvailability {
  /** A Playwright MCP connection exists for the company. */
  connected: boolean;
  /** Best-effort probe: the Playwright Chromium engine looks installed. */
  chromiumInstalled: boolean;
}

/**
 * Match a connection row to the recommended Playwright MCP: a stdio server whose
 * slug equals the preset's, OR whose command (`endpoint`) + args invoke the
 * Playwright MCP package. Tolerant of either entry path (one-click preset or a
 * hand-pasted `npx @playwright/mcp` config).
 */
function isPlaywrightMcpConnection(row: {
  transport?: string | null;
  endpoint?: string | null;
  slug?: string | null;
  args?: string[] | null;
}): boolean {
  if (row.transport !== "stdio") return false;
  if (row.slug === RECOMMENDED_PLAYWRIGHT_MCP.slug) return true;
  const cmd = (row.endpoint ?? "").toLowerCase();
  const args = (row.args ?? []).join(" ").toLowerCase();
  const invokesPlaywrightMcp =
    args.includes("@playwright/mcp") ||
    (cmd.includes("playwright") && args.includes("mcp"));
  return (cmd === "npx" || cmd.endsWith("/npx") || cmd.includes("playwright")) &&
    invokesPlaywrightMcp;
}

/** Best-effort: is the Playwright browsers cache populated? Never throws. */
function probeChromiumInstalled(): boolean {
  try {
    // Default Playwright browsers cache (override: PLAYWRIGHT_BROWSERS_PATH).
    const cacheDir =
      process.env.PLAYWRIGHT_BROWSERS_PATH ||
      path.join(homedir(), ".cache", "ms-playwright");
    if (!existsSync(cacheDir)) return false;
    const entries = readdirSync(cacheDir);
    return entries.some((e) => e.toLowerCase().startsWith("chromium"));
  } catch {
    return false;
  }
}

/**
 * Whether AI browser-use is usable right now: a Playwright MCP is connected AND
 * its Chromium engine is installed. Never throws — degrades to all-false.
 */
export async function isBrowserUseAvailable(
  companyId: string,
  userId: string
): Promise<BrowserUseAvailability> {
  let connected = false;
  try {
    const rows = await listVisibleConnections(companyId, userId);
    connected = rows.some((r) =>
      isPlaywrightMcpConnection(
        r as {
          transport?: string | null;
          endpoint?: string | null;
          slug?: string | null;
          args?: string[] | null;
        }
      )
    );
  } catch {
    connected = false;
  }
  return { connected, chromiumInstalled: probeChromiumInstalled() };
}

export interface InstallResult {
  ok: boolean;
  log: string;
}

/** Minimal subset of `child_process.spawn` we depend on (injectable for tests). */
type SpawnLike = (
  command: string,
  args: string[]
) => {
  stdout: { on(event: "data", cb: (chunk: Buffer | string) => void): void };
  stderr: { on(event: "data", cb: (chunk: Buffer | string) => void): void };
  on(event: "close", cb: (code: number | null) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
};

/**
 * Install the Chromium engine the Playwright MCP server needs
 * (`npx playwright install chromium`). Self-host only — refuses when the
 * `stdioMcp` capability is off (cloud can't spawn local processes).
 *
 * Awaited to completion with collected output (the caller decides how to surface
 * progress). `spawn` is injectable so tests never actually launch npx.
 *
 * This is the shared action S3b's "Set up browser" button + S5's CLI both call.
 */
export async function installBrowserEngine(
  opts: { spawn?: SpawnLike } = {}
): Promise<InstallResult> {
  if (!getCapabilities().stdioMcp) {
    return {
      ok: false,
      log: "Browser engine install is self-host only (this deployment cannot spawn local processes).",
    };
  }

  const spawn =
    opts.spawn ??
    ((command: string, args: string[]) => {
      // Lazy import: keep child_process out of the Edge/bundle path until invoked.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const cp = require("node:child_process") as typeof import("node:child_process");
      return cp.spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    });

  return new Promise<InstallResult>((resolve) => {
    let log = "";
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve({ ok, log: log.trim() });
    };
    try {
      const child = spawn("npx", ["playwright", "install", "chromium"]);
      child.stdout.on("data", (c) => {
        log += c.toString();
      });
      child.stderr.on("data", (c) => {
        log += c.toString();
      });
      child.on("error", (err) => {
        log += `\n${err.message}`;
        finish(false);
      });
      child.on("close", (code) => finish(code === 0));
    } catch (err) {
      log += err instanceof Error ? err.message : String(err);
      finish(false);
    }
  });
}
