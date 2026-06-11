import { homedir } from "node:os";
import { join } from "node:path";

export type ResolvedDriver =
  | { driver: "postgres"; connectionString: string }
  | { driver: "pglite"; dataDir: string };

export class BurnlessDbConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BurnlessDbConfigError";
  }
}

const POSTGRES_URL = /^postgres(ql)?:\/\//i;

function defaultDataDir(env: NodeJS.ProcessEnv): string {
  return env.BURNLESS_DATA_DIR && env.BURNLESS_DATA_DIR.trim().length > 0
    ? env.BURNLESS_DATA_DIR
    : join(homedir(), ".burnless", "data");
}

/**
 * Decide the DB driver purely from env. See spec §3.
 * Order: explicit BURNLESS_DB_DRIVER override → DATABASE_URL inference → pglite default.
 */
export function resolveDriver(env: NodeJS.ProcessEnv): ResolvedDriver {
  const override = env.BURNLESS_DB_DRIVER?.trim().toLowerCase();
  const url = env.DATABASE_URL;
  const hasPgUrl = typeof url === "string" && POSTGRES_URL.test(url);

  if (override) {
    if (override === "postgres") {
      if (!hasPgUrl) {
        throw new BurnlessDbConfigError(
          "BURNLESS_DB_DRIVER=postgres requires a postgres(ql):// DATABASE_URL",
        );
      }
      return { driver: "postgres", connectionString: url as string };
    }
    if (override === "pglite") {
      return { driver: "pglite", dataDir: defaultDataDir(env) };
    }
    throw new BurnlessDbConfigError(
      `Unknown BURNLESS_DB_DRIVER="${env.BURNLESS_DB_DRIVER}" (expected "postgres" or "pglite")`,
    );
  }

  if (hasPgUrl) return { driver: "postgres", connectionString: url as string };
  return { driver: "pglite", dataDir: defaultDataDir(env) };
}
