import type { Command } from "commander";
import { getProfile, saveConfig } from "../config";
import { runAction } from "../context";
import { renderTable } from "../render";

export function registerProfiles(program: Command): void {
  const profiles = program.command("profiles").description("Manage named profiles (~/.burnless/config.json)");

  profiles
    .command("list")
    .description("List profiles; * marks the default")
    .action(async (_opts: Record<string, never>, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        const rows = Object.entries(ctx.config.profiles).map(([name, profile]) => ({
          name,
          baseUrl: profile.baseUrl,
          auth: profile.authMode,
          default: name === ctx.config.defaultProfile ? "*" : "",
        }));
        process.stdout.write((ctx.json ? JSON.stringify(rows) : renderTable(rows)) + "\n");
      });
    });

  profiles
    .command("use <name>")
    .description("Set the default profile")
    .action(async (name: string, _opts: Record<string, never>, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        getProfile(ctx.config, name); // throws UsageError (exit 2) if unknown
        ctx.config.defaultProfile = name;
        saveConfig(ctx.config, ctx.homeDir);
        process.stderr.write(`Default profile set to "${name}".\n`);
      });
    });
}
