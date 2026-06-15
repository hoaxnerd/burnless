/**
 * `burnless update <version>` — atomic self-update of the fat-artifact (spec §2).
 *
 * Flow: resolve current version (versions/current link target) → ensure target present
 * (download+verify+extract, NO flip) → record `from` → flipCurrent(target) → post-swap
 * health check against the NEW version's launcher (`doctor --json`) → on failure, flip
 * back to `from` (rollback). The prior version dir is kept (never deleted) so rollback is
 * instant, and ~/.burnless/data + instance.env are NEVER touched (they live outside versions/).
 */
import { execFile } from "node:child_process";
import { readlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { Command } from "commander";
import { green, red } from "../ansi";
import { runAction } from "../context";
import { ensureArtifact, flipCurrent, resolveLatestVersion, versionsDir } from "../bootstrap/release";

const execFileAsync = promisify(execFile);

export interface UpdateResult {
  from: string;
  to: string;
  rolledBack: boolean;
  noop?: boolean;
  /** Why the post-swap check failed (default doctor path only). Undefined for injected checkFn. */
  error?: string;
}

/** Result of a post-swap check: ok, plus an optional short failure reason. */
export interface CheckResult {
  ok: boolean;
  error?: string;
}

/** Read the version currently pointed at by versions/current (basename of the link target). */
function currentVersion(home?: string): string {
  const link = readlinkSync(join(versionsDir(home), "current"));
  return basename(link);
}

/** Trim + collapse an error/stderr blob into a short single-line reason for messaging. */
function shortReason(raw: unknown): string {
  let msg = "";
  if (raw && typeof raw === "object") {
    const e = raw as { stderr?: unknown; message?: unknown };
    if (typeof e.stderr === "string" && e.stderr.trim()) msg = e.stderr;
    else if (typeof e.message === "string") msg = e.message;
  } else if (typeof raw === "string") {
    msg = raw;
  }
  msg = msg.replace(/\s+/g, " ").trim();
  return msg.length > 200 ? `${msg.slice(0, 197)}...` : msg;
}

/**
 * Default post-swap check: exec the NEW version's launcher `doctor --json`. Any throw → not ok,
 * with the thrown error's message/stderr captured as a short reason for the rollback message.
 */
async function defaultCheck(opts: { version: string; home?: string }): Promise<CheckResult> {
  try {
    const launcher = join(versionsDir(opts.home), opts.version, "burnless");
    await execFileAsync(launcher, ["doctor", "--json"]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: shortReason(err) || "post-swap doctor check failed" };
  }
}

export async function runUpdate(opts: {
  home?: string;
  targetVersion: string;
  base?: string;
  ensureFn?: (o: { version: string; home?: string; base?: string }) => Promise<void>;
  checkFn?: (o: { version: string; home?: string }) => Promise<boolean>;
}): Promise<UpdateResult> {
  const cur = currentVersion(opts.home);
  if (cur === opts.targetVersion) {
    return { from: cur, to: cur, rolledBack: false, noop: true };
  }

  const ensure =
    opts.ensureFn ??
    (async (o) => {
      await ensureArtifact({ base: o.base, version: o.version, home: o.home, flip: false });
    });
  await ensure({ version: opts.targetVersion, home: opts.home, base: opts.base });

  const from = cur;
  flipCurrent(opts.targetVersion, opts.home);

  // Injected checkFn keeps the simple boolean contract (no error string); the default
  // doctor path returns a richer { ok, error } so the rollback message can say WHY.
  const check: CheckResult = opts.checkFn
    ? { ok: await opts.checkFn({ version: opts.targetVersion, home: opts.home }) }
    : await defaultCheck({ version: opts.targetVersion, home: opts.home });
  if (check.ok) {
    return { from, to: opts.targetVersion, rolledBack: false };
  }

  // Post-swap check failed — roll the symlink back to the prior version.
  flipCurrent(from, opts.home);
  return { from, to: opts.targetVersion, rolledBack: true, error: check.error };
}

/** `burnless update [version]` (spec §2). */
export function registerUpdate(program: Command): void {
  program
    .command("update [version]")
    .description("Update the local fat-artifact to a specific version (atomic flip + rollback-on-fail)")
    .option("--base <url>", "release base URL override (download source)")
    .action(async (version: string | undefined, opts: { base?: string }, cmd: Command) => {
      await runAction(
        cmd,
        async (ctx) => {
          let targetVersion = version;
          if (targetVersion === undefined || targetVersion.trim() === "") {
            if (!ctx.json) process.stderr.write("resolving latest version…\n");
            targetVersion = await resolveLatestVersion();
          }
          const result = await runUpdate({
            home: ctx.homeDir,
            targetVersion,
            base: opts.base,
          });

          if (ctx.json) {
            process.stdout.write(JSON.stringify(result) + "\n");
          } else if (result.noop) {
            process.stderr.write(`${green("✓")} already at ${result.to}\n`);
          } else if (result.rolledBack) {
            const reason = result.error ? ` (reason: ${result.error})` : "";
            process.stderr.write(
              `${red("✗")} update to ${result.to} failed post-swap check — rolled back to ${result.from}${reason}\n`,
            );
          } else {
            process.stderr.write(`${green("✓")} updated ${result.from} → ${result.to}\n`);
          }

          if (result.rolledBack) process.exitCode = 1;
        },
        { allowMissingProfile: true },
      );
    });
}
