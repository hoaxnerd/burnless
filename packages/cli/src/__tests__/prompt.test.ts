import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { readSecret } from "../prompt";

describe("readSecret (--stdin pipe)", () => {
  it("reads the piped value and strips a trailing newline", async () => {
    const input = Readable.from(["s3cret\n"]);
    expect(await readSecret({ stdin: true, input })).toBe("s3cret");
  });
  it("reads multi-chunk input and strips CRLF", async () => {
    const input = Readable.from(["part1", "part2\r\n"]);
    expect(await readSecret({ stdin: true, input })).toBe("part1part2");
  });
});
