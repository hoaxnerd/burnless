/**
 * Registers the static COMMAND_TABLE (spec §7.4) onto the commander program.
 * Tool entries: positional args + typed flags → tool input, write gate, then
 * executeToolCall. Resource entries: read burnless://reports/* (spec §4.5),
 * with --period appended as a query parameter. Both honor --scenario (§7.5).
 */
import type { Command } from "commander";
import { openSessionFor, runAction, type CliContext } from "../context";
import { CliError, UsageError } from "../errors";
import type { McpSession } from "../mcp-session";
import { formatResult } from "../render";
import { confirmMutation } from "../write-safety";
import { executeToolCall, type SessionFactory } from "./call";
import type { CommandEntry, FlagSpec, ResourceCommandEntry, ToolCommandEntry } from "./table";

/** "--pre-money <amount>" → "preMoney" (mirrors commander's attribute naming). */
export function optionKeyOf(flag: string): string {
  const long = flag.split(/[ ,|]/).find((part) => part.startsWith("--"));
  if (long === undefined) throw new Error(`Flag spec missing long form: ${flag}`);
  return long.replace(/^--/, "").replace(/-([a-z])/g, (_match, ch: string) => ch.toUpperCase());
}

function coerceFlagValue(flag: FlagSpec, raw: unknown): unknown {
  if (flag.type === "boolean") return raw === true || raw === "true";
  const text = String(raw);
  switch (flag.type) {
    case "number": {
      const n = Number(text);
      if (Number.isNaN(n)) throw new UsageError(`${flag.flag} expects a number, got "${text}"`);
      return n;
    }
    case "json": {
      try {
        return JSON.parse(text);
      } catch {
        throw new UsageError(`${flag.flag} expects JSON, got "${text}"`);
      }
    }
    default:
      return text;
  }
}

export function buildToolInput(
  entry: ToolCommandEntry,
  argValues: string[],
  opts: Record<string, unknown>
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  entry.args.forEach((arg, i) => {
    const value = argValues[i];
    if (value === undefined) throw new UsageError(`Missing required argument <${arg.name}>`);
    input[arg.key] = value;
  });
  for (const flag of entry.flags) {
    const raw = opts[optionKeyOf(flag.flag)];
    if (raw === undefined) continue;
    input[flag.key] = coerceFlagValue(flag, raw);
  }
  return input;
}

export async function readReportResource(
  ctx: CliContext,
  entry: ResourceCommandEntry,
  period: string | undefined,
  scenario: string | undefined,
  sessionFactory: SessionFactory = openSessionFor
): Promise<void> {
  const uri =
    entry.resourceUri +
    (period !== undefined && entry.supportsPeriod ? `?period=${encodeURIComponent(period)}` : "");
  const session: McpSession = await sessionFactory(ctx);
  try {
    if (scenario !== undefined) {
      const activated = await session.callTool("activate_scenario", { scenarioId: scenario });
      if (activated.isError) {
        throw new CliError(`Could not activate scenario ${scenario}: ${activated.text}`);
      }
    }
    const text = await session.readResource(uri);
    process.stdout.write((ctx.json ? text : formatResult(text)) + "\n");
  } finally {
    await session.close();
  }
}

export function registerTableCommands(program: Command, table: readonly CommandEntry[]): void {
  const nounCommands = new Map<string, Command>();
  const nounOf = (noun: string): Command => {
    let existing = nounCommands.get(noun);
    if (existing === undefined) {
      existing = program.command(noun).description(`${noun} commands`);
      nounCommands.set(noun, existing);
    }
    return existing;
  };

  for (const entry of table) {
    const parent = entry.verb === null ? program : nounOf(entry.noun);
    const name = entry.verb === null ? entry.noun : entry.verb;
    const cmd = parent.command(name).description(entry.summary);

    if (entry.kind === "tool") {
      for (const arg of entry.args) cmd.argument(`<${arg.name}>`, arg.description);
      for (const flag of entry.flags) {
        if (flag.required === true) cmd.requiredOption(flag.flag, flag.description);
        else cmd.option(flag.flag, flag.description);
      }
      cmd.option("--scenario <id>", "target a scenario for this invocation");
      cmd.option("-y, --yes", "skip the confirmation prompt for write/delete tools");
      cmd.action(async (...invocation: unknown[]) => {
        const command = invocation[invocation.length - 1] as Command;
        const opts = invocation[invocation.length - 2] as Record<string, unknown>;
        const argValues = invocation.slice(0, -2) as string[];
        await runAction(command, async (ctx) => {
          const input = buildToolInput(entry, argValues, opts);
          await confirmMutation({ tool: entry.tool, input, yes: opts.yes === true });
          await executeToolCall(ctx, {
            tool: entry.tool,
            input,
            scenario: typeof opts.scenario === "string" ? opts.scenario : undefined,
          });
        });
      });
    } else {
      if (entry.supportsPeriod) cmd.option("--period <range>", "period as YYYY-MM..YYYY-MM");
      cmd.option("--scenario <id>", "target a scenario for this invocation");
      cmd.action(async (...invocation: unknown[]) => {
        const command = invocation[invocation.length - 1] as Command;
        const opts = invocation[invocation.length - 2] as Record<string, unknown>;
        await runAction(command, async (ctx) => {
          await readReportResource(
            ctx,
            entry,
            typeof opts.period === "string" ? opts.period : undefined,
            typeof opts.scenario === "string" ? opts.scenario : undefined
          );
        });
      });
    }
  }
}
