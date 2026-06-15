/**
 * The PUBLISHED npm bin (`burnless`). Pure-JS, NO app deps: serves remote/simple verbs
 * natively (buildRemoteProgram) and delegates LOCAL_VERBS to the downloaded fat-artifact
 * (delegateToArtifact downloads on first use, then execs). It must NOT statically import the
 * local command modules (they pull @burnless/db → PGLite). Spec §2 layer 1 (Model B).
 */
import { buildRemoteProgram } from "./program-remote";
import { bareVerbOrDefault, delegateToArtifact, LOCAL_VERBS, topVerb } from "./runtime";

async function main(): Promise<void> {
  // A bare (no-verb) invocation becomes the interactive `start` launcher — this is what the
  // install.sh `exec burnless` hand-off lands on. --help/--version stay native (bareVerbOrDefault
  // returns undefined for those).
  const verb = bareVerbOrDefault(process.argv);
  if (verb !== undefined && LOCAL_VERBS.has(verb)) {
    // When the verb is the synthesized `start` from a bare argv, the delegated argv must
    // carry `start` so the artifact runs the launcher (not its own bare branch).
    const argv = topVerb(process.argv) === undefined ? [...process.argv, "start"] : process.argv;
    const code = await delegateToArtifact(argv);
    process.exit(code);
  }
  const program = buildRemoteProgram();
  program.exitOverride((err) => process.exit(err.exitCode === 0 ? 0 : 2));
  program.addHelpText(
    "after",
    `\nLocal-instance commands (download the app on first use): ${[...LOCAL_VERBS].sort().join(", ")}`,
  );
  if (verb === undefined && !process.argv.includes("-V") && !process.argv.includes("--version")) {
    program.outputHelp();
    process.exit(0);
  }
  await program.parseAsync(process.argv);
}
main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});
