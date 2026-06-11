import { PassThrough } from "node:stream";
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
