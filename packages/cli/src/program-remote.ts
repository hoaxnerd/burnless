import { Command } from "commander";
import { setColorOverride } from "./ansi";
import { renderBanner } from "./banner";
import { registerCall } from "./commands/call";
import { registerCompletion } from "./commands/completion";
import { registerLogin } from "./commands/login";
import { registerLogout } from "./commands/logout";
import { registerMcp } from "./commands/mcp";
import { registerProfiles } from "./commands/profiles";
import { registerStatus } from "./commands/status";
import { COMMAND_TABLE } from "./commands/table";
import { registerTableCommands } from "./commands/register-table";
import { registerTools } from "./commands/tools";
import { registerWhoami } from "./commands/whoami";
import { versionString } from "./version";

/**
 * The remote/simple verbs program: pure-JS, NO app deps (no @burnless/db → PGLite).
 * Both the fat entry (`index.ts`, which adds the local verbs on top) and the thin
 * npm bin (`index.thin.ts`, which delegates local verbs to the artifact) build on it.
 * It must NOT import ./commands/{start,db,health,doctor,bootstrap,users,config,ai-config}.
 */
export function buildRemoteProgram(): Command {
  const program = new Command();
  program
    .name("burnless")
    .description("burnless — the founder platform, from your terminal")
    .version(versionString())
    .option("--profile <name>", "named profile (overrides BURNLESS_PROFILE and the configured default)")
    .option("--json", "machine-readable output on stdout (logs and errors stay on stderr)")
    .option("--no-color", "disable ANSI color")
    .hook("preAction", (thisCommand) => {
      // read GLOBAL opts so `--no-color` works whether placed before or within a subcommand.
      // commander sets `color:false` when --no-color is passed.
      const opts = thisCommand.optsWithGlobals<{ color?: boolean }>();
      if (opts.color === false) setColorOverride(false);
    });

  program.addHelpText("beforeAll", () => renderBanner(versionString()));

  // Remote-client + simple verbs (thin-npm native)
  registerLogin(program);
  registerStatus(program);
  registerTools(program);
  registerProfiles(program);
  registerWhoami(program);
  registerLogout(program);
  registerCall(program);
  registerTableCommands(program, COMMAND_TABLE);
  registerMcp(program);
  registerCompletion(program);

  return program;
}
