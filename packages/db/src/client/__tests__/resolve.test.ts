import { describe, it, expect } from "vitest";
import { resolveDriver, BurnlessDbConfigError } from "../resolve";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME_DEFAULT = join(homedir(), ".burnless", "data");

describe("resolveDriver", () => {
  it("infers postgres from a postgresql:// DATABASE_URL", () => {
    expect(resolveDriver({ DATABASE_URL: "postgresql://h/db" })).toEqual({
      driver: "postgres",
      connectionString: "postgresql://h/db",
    });
  });

  it("infers postgres from a postgres:// DATABASE_URL", () => {
    expect(resolveDriver({ DATABASE_URL: "postgres://h/db" }).driver).toBe("postgres");
  });

  it("defaults to pglite at ~/.burnless/data when no DATABASE_URL", () => {
    expect(resolveDriver({})).toEqual({ driver: "pglite", dataDir: HOME_DEFAULT });
  });

  it("honors BURNLESS_DATA_DIR for the pglite path", () => {
    expect(resolveDriver({ BURNLESS_DATA_DIR: "/tmp/bl" })).toEqual({
      driver: "pglite",
      dataDir: "/tmp/bl",
    });
  });

  it("treats a non-postgres DATABASE_URL as pglite (robust to stray empty var)", () => {
    expect(resolveDriver({ DATABASE_URL: "" }).driver).toBe("pglite");
    expect(resolveDriver({ DATABASE_URL: "not-a-url" }).driver).toBe("pglite");
  });

  it("BURNLESS_DB_DRIVER=pglite overrides a present postgres URL", () => {
    expect(
      resolveDriver({ BURNLESS_DB_DRIVER: "pglite", DATABASE_URL: "postgres://h/db" }),
    ).toEqual({ driver: "pglite", dataDir: HOME_DEFAULT });
  });

  it("BURNLESS_DB_DRIVER=postgres uses DATABASE_URL", () => {
    expect(
      resolveDriver({ BURNLESS_DB_DRIVER: "POSTGRES", DATABASE_URL: "postgres://h/db" }).driver,
    ).toBe("postgres");
  });

  it("BURNLESS_DB_DRIVER=postgres without DATABASE_URL throws", () => {
    expect(() => resolveDriver({ BURNLESS_DB_DRIVER: "postgres" })).toThrow(BurnlessDbConfigError);
  });

  it("an unknown BURNLESS_DB_DRIVER throws", () => {
    expect(() => resolveDriver({ BURNLESS_DB_DRIVER: "sqlite" })).toThrow(BurnlessDbConfigError);
  });
});
