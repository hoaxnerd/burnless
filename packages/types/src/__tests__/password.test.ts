import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password";

describe("password hashing", () => {
  it("round-trips a correct password", async () => {
    const stored = await hashPassword("hunter2");
    expect(stored.startsWith("pbkdf2:")).toBe(true);
    expect(await verifyPassword("hunter2", stored)).toBe(true);
  });
  it("rejects a wrong password", async () => {
    const stored = await hashPassword("hunter2");
    expect(await verifyPassword("nope", stored)).toBe(false);
  });
  it("rejects a malformed stored value", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});
