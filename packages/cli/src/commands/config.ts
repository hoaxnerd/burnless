import type { Command } from "commander";
import { closeDatabase, initDatabase, isOwnerClaimed } from "@burnless/db";
import { runAction } from "../context";
import { UsageError } from "../errors";
import { instanceEnvPath, readInstanceEnv, setInstanceEnvVar } from "../local/home";

const OFF_VALUES = new Set(["off", "false", "0", "no"]);

export function runConfigGet(opts: { key: string; home?: string }): string | undefined {
  return readInstanceEnv(opts.home)[opts.key];
}

export function runConfigList(opts: { home?: string } = {}): Record<string, string> {
  return readInstanceEnv(opts.home);
}

export async function runConfigSet(opts: { key: string; value: string; home?: string }): Promise<void> {
  // Claim-guard: disabling auto-login while unclaimed is a delayed lockout (spec §4).
  if (opts.key === "BURNLESS_CAP_AUTO_LOGIN" && OFF_VALUES.has(opts.value.trim().toLowerCase())) {
    await initDatabase();
    let claimed: boolean;
    try {
      claimed = await isOwnerClaimed();
    } finally {
      await closeDatabase();
    }
    if (!claimed) {
      throw new UsageError(
        "Refusing to disable auto-login: the owner has no password yet, so this would lock " +
          "you out (live session expires, then there's no way to sign in).\n" +
          "Set a password first: `burnless users passwd`, then re-run this.",
      );
    }
  }
  setInstanceEnvVar(opts.key, opts.value, opts.home);
}

export async function runConfigUnset(opts: { key: string; home?: string }): Promise<void> {
  const current = readInstanceEnv(opts.home);
  if (!(opts.key in current)) return;
  delete current[opts.key];
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  const path = instanceEnvPath(opts.home);
  const body = Object.entries(current).map(([k, v]) => `${k}=${v}`).join("\n");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, body.length ? body + "\n" : "", { mode: 0o600 });
}

/** `burnless config get | set | list | unset` (spec §3/§4 — instance.env + claim-guard). */
export function registerConfig(program: Command): void {
  const cfg = program.command("config").description("Read/write local instance configuration (~/.burnless/instance.env)");

  cfg
    .command("get")
    .argument("<key>")
    .action(async (key: string, _opts, cmd: Command) => {
      await runAction(
        cmd,
        async (ctx) => {
          const value = runConfigGet({ key });
          if (ctx.json) process.stdout.write(JSON.stringify({ key, value: value ?? null }) + "\n");
          else process.stdout.write((value ?? "") + "\n");
        },
        { allowMissingProfile: true },
      );
    });

  cfg
    .command("set")
    .argument("<key>")
    .argument("<value>")
    .action(async (key: string, value: string, _opts, cmd: Command) => {
      await runAction(
        cmd,
        async () => {
          await runConfigSet({ key, value });
          process.stderr.write(`Set ${key}.\n`);
        },
        { allowMissingProfile: true },
      );
    });

  cfg
    .command("list")
    .action(async (_opts, cmd: Command) => {
      await runAction(
        cmd,
        async (ctx) => {
          const all = runConfigList();
          if (ctx.json) process.stdout.write(JSON.stringify(all) + "\n");
          else for (const [k, v] of Object.entries(all)) process.stdout.write(`${k}=${v}\n`);
        },
        { allowMissingProfile: true },
      );
    });

  cfg
    .command("unset")
    .argument("<key>")
    .action(async (key: string, _opts, cmd: Command) => {
      await runAction(
        cmd,
        async () => {
          await runConfigUnset({ key });
          process.stderr.write(`Unset ${key}.\n`);
        },
        { allowMissingProfile: true },
      );
    });
}
