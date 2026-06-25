import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
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

/**
 * True when `argv1` resolves to the same real file as this module (`selfUrl`).
 * BOTH sides are realpath'd before comparison: Node already symlink-resolves
 * `import.meta.url`, but `process.argv[1]` is the raw invocation path. A symlink
 * anywhere in that path — npm global-bin shims, version managers
 * (nvm/volta/asdf), or macOS `/tmp` → `/private/tmp` — would otherwise make the
 * two differ, so the entry guard would be false and the CLI would exit 0 doing
 * nothing. The launcher script already passes a realpath, so this only hardens
 * direct/symlinked `node cli/index.js` invocations; the failure mode (a silent
 * no-op) is bad enough to warrant the guard. Exported for the regression test.
 */
export function isEntryPoint(selfUrl: string, argv1: string | undefined): boolean {
  if (argv1 === undefined) return false;
  try {
    return realpathSync(fileURLToPath(selfUrl)) === realpathSync(argv1);
  } catch {
    // realpathSync throws if argv1 is not a real file (rare); fall back to the
    // raw URL comparison so behaviour is never worse than before.
    return selfUrl === pathToFileURL(argv1).href;
  }
}

const isMain = isEntryPoint(import.meta.url, process.argv[1]);

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
