import { PassThrough } from "node:stream";
import { MUTATION_TOOL_NAMES } from "@burnless/ai";
import { describe, expect, it } from "vitest";
import { UsageError } from "../errors";
import { categorizeTool, confirmMutation, type ConfirmIo } from "../write-safety";

function makeIo(isTTY: boolean): { io: ConfirmIo; input: PassThrough; written: () => string } {
  const input = new PassThrough();
  const output = new PassThrough();
  let written = "";
  output.on("data", (d: Buffer) => {
    written += d.toString();
  });
  return { io: { isTTY, input, output }, input, written: () => written };
}

describe("categorizeTool (local prefix heuristic, spec §7.4)", () => {
  it("classifies delete_/create_/update_ and defaults to read", () => {
    expect(categorizeTool("delete_headcount")).toBe("delete");
    expect(categorizeTool("create_scenario")).toBe("write");
    expect(categorizeTool("update_funding_round")).toBe("write");
    expect(categorizeTool("get_metrics")).toBe("read");
    expect(categorizeTool("list_scenarios")).toBe("read");
    expect(categorizeTool("activate_scenario")).toBe("read"); // view change, not a mutation
  });

  // Cross-domain write tools (e.g. company-knowledge facts) are NOT in
  // @burnless/ai's finance-only MUTATION_TOOL_NAMES, so the drift guard below
  // can't cover them — pin their prefixes explicitly so the CLI write gate
  // confirms a fact write/delete instead of waving it through as a read.
  it("classifies remember_/forget_ domain tools as write/delete", () => {
    expect(categorizeTool("remember_fact")).toBe("write");
    expect(categorizeTool("forget_fact")).toBe("delete");
    expect(categorizeTool("list_facts")).toBe("read");
  });
});

// Registry drift guard (major #1/#2): the local prefix heuristic must never let
// an authoritative mutation tool slip through as "read" and skip the Proceed?
// (y/N) confirmation. Every member of @burnless/ai's MUTATION_TOOL_NAMES (the
// server-side write/delete set) must classify as a non-read category here. Today
// every name is prefixed create_/update_/delete_ so this is green; the moment a
// non-prefixed mutation tool (e.g. promote_scenario, mark_grant_milestone_hit,
// set_*) is added server-side, CI fails here instead of silently bypassing the
// write gate.
describe("categorizeTool drift guard vs @burnless/ai MUTATION_TOOL_NAMES", () => {
  it("classifies every authoritative mutation tool as write or delete (never read)", () => {
    expect(MUTATION_TOOL_NAMES.size).toBeGreaterThan(0);
    for (const name of MUTATION_TOOL_NAMES) {
      expect(categorizeTool(name), name).not.toBe("read");
    }
  });
});

describe("confirmMutation", () => {
  it("read tools never prompt", async () => {
    const { io, written } = makeIo(false);
    await confirmMutation({ tool: "get_metrics", input: {}, yes: false, io });
    expect(written()).toBe("");
  });

  it("--yes skips the prompt for mutations", async () => {
    const { io, written } = makeIo(false);
    await confirmMutation({ tool: "delete_headcount", input: { id: "h1" }, yes: true, io });
    expect(written()).toBe("");
  });

  it("non-TTY without --yes refuses with exit 2", async () => {
    const { io } = makeIo(false);
    await expect(
      confirmMutation({ tool: "delete_headcount", input: { id: "h1" }, yes: false, io })
    ).rejects.toMatchObject({ exitCode: 2 });
  });

  it("TTY: prints the JSON input, accepts y", async () => {
    const { io, input, written } = makeIo(true);
    const pending = confirmMutation({ tool: "update_headcount", input: { id: "h1", salary: 90000 }, yes: false, io });
    input.write("y\n");
    await pending;
    expect(written()).toContain('"salary": 90000');
    expect(written()).toContain("Proceed? (y/N)");
  });

  it("TTY: anything but y/yes aborts with exit 2", async () => {
    const { io, input } = makeIo(true);
    const pending = confirmMutation({ tool: "delete_headcount", input: { id: "h1" }, yes: false, io });
    input.write("n\n");
    await expect(pending).rejects.toThrow(UsageError);
  });
});
