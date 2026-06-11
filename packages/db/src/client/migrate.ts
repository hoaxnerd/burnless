import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import type { DbHandle } from "./create";

export type Dialect = "postgres" | "pglite";

/**
 * Whether to auto-migrate on boot. See spec §5.
 * Explicit BURNLESS_AUTO_MIGRATE wins (only the literal "true" enables);
 * otherwise default is on for pglite, off for postgres.
 */
export function shouldAutoMigrate(dialect: Dialect, env: NodeJS.ProcessEnv): boolean {
  const raw = env.BURNLESS_AUTO_MIGRATE;
  if (typeof raw === "string" && raw.length > 0) return raw === "true";
  return dialect === "pglite";
}

function getMigrationsFolder(): string {
  const override = process.env.BURNLESS_MIGRATIONS_DIR;
  if (override && override.trim().length > 0) return override;
  // packages/db/src/client/ -> packages/db/drizzle (source/dev resolution)
  return join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
}

/** Apply the drizzle migration baseline for the handle's dialect. See spec §5. */
export async function applyMigrations(handle: DbHandle): Promise<void> {
  const migrationsFolder = getMigrationsFolder();
  if (handle.dialect === "pglite") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migratePglite(handle.db as any, { migrationsFolder });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migratePostgres(handle.db as any, { migrationsFolder });
  }
}
