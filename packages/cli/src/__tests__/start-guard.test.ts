import { describe, expect, it } from "vitest";
import { assertExposureAllowed } from "../commands/start";
import { UsageError } from "../errors";

describe("assertExposureAllowed", () => {
  it("allows loopback hosts", () => {
    for (const host of ["127.0.0.1", "localhost", "::1"]) {
      expect(() => assertExposureAllowed(host, false)).not.toThrow();
    }
  });
  it("refuses a wider bind without --unsafe-expose", () => {
    expect(() => assertExposureAllowed("0.0.0.0", false)).toThrow(UsageError);
  });
  it("allows a wider bind with --unsafe-expose", () => {
    expect(() => assertExposureAllowed("0.0.0.0", true)).not.toThrow();
  });
});
