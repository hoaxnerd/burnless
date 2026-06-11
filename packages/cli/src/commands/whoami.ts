import type { Command } from "commander";
import { runAction } from "../context";
import { loadCredential } from "../credentials";
import { renderTable } from "../render";

export function registerWhoami(program: Command): void {
  program
    .command("whoami")
    .description("Show the active profile and stored credential kind")
    .action(async (_opts: Record<string, never>, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        const cred = await loadCredential(ctx.keychain, ctx.profileName);
        const info = {
          profile: ctx.profileName,
          baseUrl: ctx.profile.baseUrl,
          authMode: ctx.profile.authMode,
          credential: cred === null ? "none" : cred.kind,
          loggedIn: cred !== null,
        };
        process.stdout.write(
          (ctx.json
            ? JSON.stringify(info)
            : renderTable(Object.entries(info).map(([key, value]) => ({ key, value })))) + "\n"
        );
      });
    });
}
