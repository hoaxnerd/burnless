import type { Command } from "commander";
import { runAction } from "../context";
import { UsageError } from "../errors";
import { attachServe } from "./serve";

/** `burnless mcp serve | add | list` (spec §3 — `serve` renamed under `mcp`). */
export function registerMcp(program: Command): void {
  const mcp = program.command("mcp").description("MCP server + connection management");
  attachServe(mcp); // `mcp serve` — the stdio proxy (was top-level `serve`)

  mcp
    .command("add")
    .description("Connect an external MCP server (coming in a later release)")
    .argument("[args...]")
    .allowUnknownOption(true)
    .action(async (_args: string[], _opts, cmd: Command) => {
      await runAction(cmd, async () => {
        throw new UsageError("`mcp add` is not available yet — manage connections in the web UI for now.");
      });
    });

  mcp
    .command("list")
    .description("List connected MCP servers (coming in a later release)")
    .action(async (_opts, cmd: Command) => {
      await runAction(cmd, async () => {
        throw new UsageError("`mcp list` is not available yet — see Connectors in the web UI for now.");
      });
    });
}
