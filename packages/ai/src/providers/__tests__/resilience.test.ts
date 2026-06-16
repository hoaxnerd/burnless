import { describe, test, expect } from "vitest";
import { EmptyCompletionError, isRetryableError } from "../resilience";

describe("EmptyCompletionError", () => {
  test("EmptyCompletionError is retryable", () => {
    expect(isRetryableError(new EmptyCompletionError("google/gemini-2.5-flash-lite"))).toBe(true);
  });

  test("message names the model", () => {
    const err = new EmptyCompletionError("google/gemini-2.5-flash-lite");
    expect(err.name).toBe("EmptyCompletionError");
    expect(err.message).toContain("google/gemini-2.5-flash-lite");
  });
});
