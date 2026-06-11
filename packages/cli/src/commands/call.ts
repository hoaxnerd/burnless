/**
 * `burnless call <tool> --input '{json}'` — the escape hatch (spec §7.4, C2):
 * complete by construction because it maps 1:1 onto the remote tool surface.
 * executeToolCall is shared with the noun-verb commands (register-table.ts):
 * it owns the --scenario activate_scenario preamble (spec §7.5) and output.
 */
import type { Command } from "commander";
import { openSessionFor, runAction, type CliContext } from "../context";
import { CliError, UsageError } from "../errors";
import type { McpSession } from "../mcp-session";
import { formatResult } from "../render";
import { confirmMutation } from "../write-safety";

export function parseJsonObject(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError(`--input is not valid JSON: ${raw}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new UsageError('--input must be a JSON object, e.g. \'{"name":"Q3 plan"}\'.');
  }
  return parsed as Record<string, unknown>;
}

export type SessionFactory = (ctx: CliContext) => Promise<McpSession>;

export async function executeToolCall(
  ctx: CliContext,
  opts: { tool: string; input: Record<string, unknown>; scenario?: string },
  sessionFactory: SessionFactory = openSessionFor
): Promise<void> {
  const session = await sessionFactory(ctx);
  try {
    if (opts.scenario !== undefined) {
      // Same-session preamble: the server binds scenarioId to the MCP session
      // (spec §4.4), so the main call below reads/writes through the scenario.
      const activated = await session.callTool("activate_scenario", { scenarioId: opts.scenario });
      if (activated.isError) {
        throw new CliError(`Could not activate scenario ${opts.scenario}: ${activated.text}`);
      }
    }
    const result = await session.callTool(opts.tool, opts.input);
    if (result.isError) throw new CliError(result.text);
    process.stdout.write((ctx.json ? result.text : formatResult(result.text)) + "\n");
  } finally {
    await session.close();
  }
}

export function registerCall(program: Command): void {
  program
    .command("call <tool>")
    .description("Call any MCP tool by name — the escape hatch")
    .option("--input <json>", "JSON object input for the tool", "{}")
    .option("--scenario <id>", "activate this scenario in the session before the call")
    .option("-y, --yes", "skip the confirmation prompt for write/delete tools")
    .action(async (tool: string, opts: { input: string; scenario?: string; yes?: boolean }, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        const input = parseJsonObject(opts.input);
        await confirmMutation({ tool, input, yes: opts.yes === true }); // gate BEFORE any network I/O
        await executeToolCall(ctx, { tool, input, scenario: opts.scenario });
      });
    });
}
