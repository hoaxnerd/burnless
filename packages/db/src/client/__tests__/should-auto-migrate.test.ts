import { describe, it, expect } from "vitest";
import { shouldAutoMigrate } from "../migrate";

describe("shouldAutoMigrate", () => {
  it("defaults to true for pglite", () => {
    expect(shouldAutoMigrate("pglite", {})).toBe(true);
  });
  it("defaults to false for postgres", () => {
    expect(shouldAutoMigrate("postgres", {})).toBe(false);
  });
  it("BURNLESS_AUTO_MIGRATE=true forces on for postgres", () => {
    expect(shouldAutoMigrate("postgres", { BURNLESS_AUTO_MIGRATE: "true" })).toBe(true);
  });
  it("BURNLESS_AUTO_MIGRATE=false forces off for pglite", () => {
    expect(shouldAutoMigrate("pglite", { BURNLESS_AUTO_MIGRATE: "false" })).toBe(false);
  });
  it("any non-\"true\" value is treated as false when explicitly set", () => {
    expect(shouldAutoMigrate("pglite", { BURNLESS_AUTO_MIGRATE: "0" })).toBe(false);
    expect(shouldAutoMigrate("pglite", { BURNLESS_AUTO_MIGRATE: "yes" })).toBe(false);
  });
});
