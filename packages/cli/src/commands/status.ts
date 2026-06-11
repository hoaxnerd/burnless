import type { Command } from "commander";
import { openSessionFor, runAction } from "../context";
import { loadCredential } from "../credentials";
import { CliError } from "../errors";
import type { McpSession } from "../mcp-session";
import { renderTable } from "../render";

export function registerStatus(program: Command): void {
  program
    .command("status")
    .description("Check instance reachability, server version, and tool count for the active profile")
    .action(async (_opts: Record<string, never>, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        let session: McpSession;
        try {
          session = await openSessionFor(ctx);
        } catch (err) {
          if (err instanceof CliError) throw err; // e.g. "not logged in" stays exit 2
          const message = err instanceof Error ? err.message : String(err);
          throw new CliError(`Cannot reach ${ctx.profile.baseUrl}/mcp — ${message}`);
        }
        try {
          const tools = await session.listTools();
          const server = session.serverVersion();
          const cred = await loadCredential(ctx.keychain, ctx.profileName);
          // Effective scopes are enforced server-side per call (spec §5.1) and are
          // not introspectable in v1 — we report the credential kind instead.
          const info = {
            profile: ctx.profileName,
            baseUrl: ctx.profile.baseUrl,
            reachable: true,
            server: server === undefined ? "unknown" : `${server.name} ${server.version}`,
            tools: tools.length,
            credential: cred === null ? "none" : cred.kind,
          };
          process.stdout.write(
            (ctx.json
              ? JSON.stringify(info)
              : renderTable(Object.entries(info).map(([key, value]) => ({ key, value })))) + "\n"
          );
        } finally {
          await session.close();
        }
      });
    });
}
