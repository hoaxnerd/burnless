import type { Command } from "commander";
import { runAction } from "../context";
import { deleteCredential } from "../credentials";

export function registerLogout(program: Command): void {
  program
    .command("logout")
    .description("Clear stored credentials for the active profile")
    .action(async (_opts: Record<string, never>, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        await deleteCredential(ctx.keychain, ctx.profileName);
        // v1 has no token-revocation endpoint (spec §5.2 revocation is UI-driven):
        // local credentials are cleared; server-side revocation lives on the Your MCP tab.
        process.stderr.write(
          `Cleared local credentials for profile "${ctx.profileName}".\n` +
            `To revoke the token server-side, use Connections → Your MCP on ${ctx.profile.baseUrl}.\n`
        );
      });
    });
}
