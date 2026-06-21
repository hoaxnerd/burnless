import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { registerKey, registerModel, registerProvider } from "./commands/ai-config";
import { registerBootstrap } from "./commands/bootstrap";
import { registerConfig } from "./commands/config";
import { registerDb } from "./commands/db";
import { registerDoctor } from "./commands/doctor";
import { registerHealth } from "./commands/health";
import { registerStart } from "./commands/start";
import { registerUpdate } from "./commands/update";
import { registerUsers } from "./commands/users";
import { buildRemoteProgram } from "./program-remote";
import { topVerb } from "./runtime";

/**
 * The FAT program — the fat-artifact's `cli/index.js`. It IS the artifact, so it runs
 * everything natively: remote/simple verbs (via buildRemoteProgram) PLUS the local-instance
 * verbs that pull in @burnless/db / PGLite. The published npm bin uses `index.thin.ts`,
 * which never imports the local command modules below.
 */
export function buildProgram(): Command {
  const program = buildRemoteProgram();

  // Local-instance verbs (fat-artifact runs these natively; thin delegates via the artifact)
  registerStart(program);
  registerDb(program);
  registerHealth(program);
  registerDoctor(program);
  registerBootstrap(program);
  registerUsers(program);
  registerConfig(program);
  registerProvider(program);
  registerKey(program);
  registerModel(program);
  registerUpdate(program);

  return program;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const program = buildProgram();
  program.exitOverride((err) => {
    process.exit(err.exitCode === 0 ? 0 : 2);
  });
  const verbForBare = topVerb(process.argv);
  const wantsHelpOrVersion =
    process.argv.includes("-V") || process.argv.includes("--version") ||
    process.argv.includes("-h") || process.argv.includes("--help");
  if (verbForBare === undefined && !wantsHelpOrVersion) {
    // Bare `burnless` (no verb, no flags) = help, NOT start.
    program.outputHelp();
    process.exit(0);
  }
  await program.parseAsync(process.argv);
}
