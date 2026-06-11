/**
 * Terminal analogue of the chat write gate (spec §7.4): mutations echo the
 * exact JSON input and require `Proceed? (y/N)` unless --yes/-y. Non-TTY
 * without --yes refuses with exit 2 (CI must be explicit). Category comes from
 * a deliberately tiny local prefix heuristic — pinned in the design:
 * delete_ → delete; create_ / update_ → write; everything else → read.
 *
 * The heuristic stays runtime-dependency-free on purpose (importing the
 * authoritative @burnless/ai `categorizeToolName` would bundle the whole AI
 * module graph into the published CLI — see tsup `noExternal`). It is kept
 * honest by a registry drift guard in `__tests__/write-safety.test.ts`: that
 * test enumerates @burnless/ai's `MUTATION_TOOL_NAMES` (the server-side
 * write+delete set) and asserts every member classifies here as non-`read`.
 * Today all mutation tools are prefixed create_/update_/delete_, so the
 * heuristic is exhaustive; the moment a non-prefixed mutation tool is added
 * server-side, that test fails instead of letting the write gate be bypassed.
 */
import { createInterface } from "node:readline/promises";
import { UsageError } from "./errors";

export type ToolCategory = "read" | "write" | "delete";

export function categorizeTool(name: string): ToolCategory {
  if (name.startsWith("delete_")) return "delete";
  if (name.startsWith("create_") || name.startsWith("update_")) return "write";
  return "read";
}

export interface ConfirmIo {
  isTTY: boolean;
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

export interface ConfirmOptions {
  tool: string;
  input: Record<string, unknown>;
  yes: boolean;
  io?: ConfirmIo;
}

/** Resolves when the call may proceed; throws UsageError (exit 2) otherwise. */
export async function confirmMutation(opts: ConfirmOptions): Promise<void> {
  const category = categorizeTool(opts.tool);
  if (category === "read") return;
  if (opts.yes) return;
  // Prompt + echoed input go to the OUTPUT stream (stderr by default) so
  // --json stdout stays machine-clean.
  const io: ConfirmIo = opts.io ?? {
    isTTY: process.stdin.isTTY === true,
    input: process.stdin,
    output: process.stderr,
  };
  if (!io.isTTY) {
    throw new UsageError(
      `Refusing to run ${category} tool "${opts.tool}" without confirmation in a non-interactive shell. Re-run with --yes.`
    );
  }
  io.output.write(
    `About to run ${category} tool ${opts.tool} with input:\n${JSON.stringify(opts.input, null, 2)}\n`
  );
  const rl = createInterface({ input: io.input, output: io.output });
  const answer = (await rl.question("Proceed? (y/N) ")).trim().toLowerCase();
  rl.close();
  if (answer !== "y" && answer !== "yes") {
    throw new UsageError("Aborted.");
  }
}
