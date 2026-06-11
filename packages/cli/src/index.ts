import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { registerAdmin } from "./commands/admin";
import { registerCall } from "./commands/call";
import { registerLogin } from "./commands/login";
import { registerLogout } from "./commands/logout";
import { registerProfiles } from "./commands/profiles";
import { registerTableCommands } from "./commands/register-table";
import { registerStatus } from "./commands/status";
import { COMMAND_TABLE } from "./commands/table";
import { registerTools } from "./commands/tools";
import { registerWhoami } from "./commands/whoami";
import { CLI_VERSION } from "./version";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("burnless")
    .description("Burnless from your terminal — an MCP client of your own Burnless instance")
    .version(CLI_VERSION)
    .option("--profile <name>", "named profile (overrides BURNLESS_PROFILE and the configured default)")
    .option("--json", "machine-readable output on stdout (logs and errors stay on stderr)");

  registerLogin(program);
  registerStatus(program);
  registerTools(program);
  registerProfiles(program);
  registerWhoami(program);
  registerLogout(program);
  registerCall(program);
  registerTableCommands(program, COMMAND_TABLE);
  registerAdmin(program);
  return program;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const program = buildProgram();
  // Commander usage errors (unknown command, missing arg) are user errors → exit 2.
  program.exitOverride((err) => {
    process.exit(err.exitCode === 0 ? 0 : 2);
  });
  await program.parseAsync(process.argv);
}
