import { describe, expect, it } from "vitest";
import { CliError, UsageError } from "../errors";

describe("CliError", () => {
  it("defaults to exit code 1 (server/tool error)", () => {
    const err = new CliError("boom");
    expect(err.exitCode).toBe(1);
    expect(err.message).toBe("boom");
    expect(err).toBeInstanceOf(Error);
  });

  it("accepts an explicit exit code", () => {
    expect(new CliError("nope", 2).exitCode).toBe(2);
  });

  it("UsageError is exit code 2 (user/validation error)", () => {
    const err = new UsageError("bad flag");
    expect(err.exitCode).toBe(2);
    expect(err).toBeInstanceOf(CliError);
  });
});
