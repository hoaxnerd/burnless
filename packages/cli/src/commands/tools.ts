import type { Command } from "commander";
import { openSessionFor, runAction } from "../context";
import { renderTable } from "../render";

export function registerTools(program: Command): void {
  program
    .command("tools")
    .description("List the MCP tools exposed by the active profile's instance")
    .action(async (_opts: Record<string, never>, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        const session = await openSessionFor(ctx);
        try {
          const tools = await session.listTools();
          if (ctx.json) {
            process.stdout.write(JSON.stringify(tools) + "\n");
            return;
          }
          const rows = tools.map((tool) => ({
            name: tool.name,
            description: (tool.description ?? "").slice(0, 70),
          }));
          process.stdout.write(renderTable(rows) + "\n");
        } finally {
          await session.close();
        }
      });
    });
}
