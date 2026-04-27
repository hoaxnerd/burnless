import { describe, it, expect } from "vitest";
import { ConfirmableError, serializeConfirmable } from "../confirmable-error";

describe("ConfirmableError", () => {
  it("carries code, message, and details", () => {
    const err = new ConfirmableError(
      "Confirm to proceed",
      "TEST_CODE",
      { existingCount: 3 }
    );
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("Confirm to proceed");
    expect(err.details).toEqual({ existingCount: 3 });
    expect(err.name).toBe("ConfirmableError");
    expect(err instanceof Error).toBe(true);
  });

  it("serializes to the documented 409 response shape", () => {
    const err = new ConfirmableError("msg", "CODE_X", { foo: 1 });
    expect(serializeConfirmable(err)).toEqual({
      error: "msg",
      code: "CODE_X",
      requiresConfirmation: true,
      details: { foo: 1 },
    });
  });

  it("omits details when none supplied", () => {
    const err = new ConfirmableError("msg", "CODE_X");
    expect(serializeConfirmable(err)).toEqual({
      error: "msg",
      code: "CODE_X",
      requiresConfirmation: true,
    });
  });
});
