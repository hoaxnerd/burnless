import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { setColorOverride } from "./ansi";
import { renderBanner } from "./banner";
import { registerBootstrap } from "./commands/bootstrap";
import { registerCall } from "./commands/call";
import { registerCompletion } from "./commands/completion";
import { registerDb } from "./commands/db";
import { registerDoctor } from "./commands/doctor";
import { registerHealth } from "./commands/health";
import { registerLogin } from "./commands/login";
import { registerLogout } from "./commands/logout";
import { registerMcp } from "./commands/mcp";
import { registerProfiles } from "./commands/profiles";
import { registerStart } from "./commands/start";
import { registerStatus } from "./commands/status";
import { COMMAND_TABLE } from "./commands/table";
import { registerTableCommands } from "./commands/register-table";
import { registerTools } from "./commands/tools";
import { registerWhoami } from "./commands/whoami";
import { delegateToArtifact, LOCAL_VERBS, resolveRuntimeMode, topVerb } from "./runtime";
import { versionString } from "./version";

export function buildProgram(): Command {
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

  // Local-instance verbs (fat-artifact; thin delegates via the dispatch seam in main)
  registerStart(program);
  registerDb(program);
  registerHealth(program);
  registerDoctor(program);
  registerBootstrap(program);

  return program;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  // Thin/fat dispatch seam (spec L2/L3): when running as the thin npm package and the
  // invoked verb needs the local instance, delegate by exec to the fat-artifact.
  const verb = topVerb(process.argv);
  if (resolveRuntimeMode() === "thin" && verb !== undefined && LOCAL_VERBS.has(verb)) {
    delegateToArtifact(process.argv)
      .then((code) => process.exit(code))
      .catch((err) => {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(2);
      });
  } else {
    const program = buildProgram();
    program.exitOverride((err) => {
      process.exit(err.exitCode === 0 ? 0 : 2);
    });
    const verbForBare = topVerb(process.argv);
    const wantsVersion = process.argv.includes("-V") || process.argv.includes("--version");
    if (verbForBare === undefined && !wantsVersion) {
      program.outputHelp();
      process.exit(0);
    }
    await program.parseAsync(process.argv);
  }
}
