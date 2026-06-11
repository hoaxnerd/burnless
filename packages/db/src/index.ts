import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { PgDatabase } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";
import { resolveDriver } from "./client/resolve";
import { createClient, type DbHandle } from "./client/create";
import { applyMigrations, shouldAutoMigrate } from "./client/migrate";

export * from "./schema";
export { schema };
export * from "./queries";
export { encryptSecret, decryptSecret, encryptJson, decryptJson } from "./crypto";
export {
  sha256hex,
  generateSecretToken,
  type GeneratedSecret,
  type BurnlessTokenPrefix,
} from "./token-hash";
export { resolveDriver, BurnlessDbConfigError, type ResolvedDriver } from "./client/resolve";
export { createClient, type DbHandle } from "./client/create";
export { applyMigrations, shouldAutoMigrate, type Dialect } from "./client/migrate";

/** Single public DB type (spec §6). PGLite instances are cast to this. */
export type Database = PostgresJsDatabase<typeof schema>;

interface DbGlobal {
  __burnless_db?: Database;
  __burnless_handle?: DbHandle;
  __burnless_pglite?: unknown;
}
const g = globalThis as unknown as DbGlobal;

/**
 * Lazily create the postgres-js singleton synchronously — preserves the
 * pre-S2 behavior so any non-boot access in a postgres deployment still works.
 * PGLite cannot be created synchronously, so the pglite path is NOT handled
 * here; it must be boot-initialized via initDatabase() (instrumentation does this).
 */
function lazySyncPostgresOrThrow(): Database {
  const resolved = resolveDriver(process.env);
  if (resolved.driver !== "postgres") {
    throw new Error(
      "Database not initialized — initDatabase() must run first " +
        "(instrumentation.register does this on boot). PGLite cannot be created synchronously.",
    );
  }
  const client = postgres(resolved.connectionString, { max: 10 });
  const db = drizzlePostgres(client, { schema });
  g.__burnless_db = db;
  g.__burnless_handle = { db, dialect: "postgres", raw: client, close: () => client.end() };
  return db;
}

function resolveLiveDb(): Database {
  return g.__burnless_db ?? lazySyncPostgresOrThrow();
}

/**
 * Public DB handle. A Proxy that forwards every access to the live instance on
 * globalThis (set by initDatabase or by test setup). Method calls happen at
 * request time, after boot. The 254 `import { db }` sites are unchanged.
 */
export const db: Database = new Proxy({} as Database, {
  get(_t, prop, receiver) {
    const live = resolveLiveDb();
    const value = Reflect.get(live as object, prop, receiver);
    return typeof value === "function" ? value.bind(live) : value;
  },
  has(_t, prop) {
    return Reflect.has(resolveLiveDb() as object, prop);
  },
  // Drizzle's `is(db, PgDatabase)` (used by @auth/drizzle-adapter at import time,
  // before initDatabase() runs) checks the prototype chain. Both postgres-js and
  // PGLite drizzle instances are PgDatabase subclasses (public type is
  // PostgresJsDatabase, a PgDatabase). Forwarding getPrototypeOf to PgDatabase.prototype
  // makes the Proxy type-detectable WITHOUT a live instance — so adapter construction
  // works during `next build` page-data collection (no DATABASE_URL yet). spec §6.
  getPrototypeOf() {
    return PgDatabase.prototype;
  },
});

/**
 * Idempotent boot initializer. Resolves the driver, creates the client,
 * auto-migrates per the gate, and assigns the global singleton. (spec §7)
 */
export async function initDatabase(): Promise<Database> {
  if (g.__burnless_db) return g.__burnless_db;
  const resolved = resolveDriver(process.env);
  const handle = await createClient(resolved);
  if (shouldAutoMigrate(handle.dialect, process.env)) {
    await applyMigrations(handle);
  }
  g.__burnless_db = handle.db;
  g.__burnless_handle = handle;
  if (handle.dialect === "pglite") g.__burnless_pglite = handle.raw;
  return handle.db;
}

/** Close + clear the live DB (graceful shutdown / test teardown). */
export async function closeDatabase(): Promise<void> {
  const handle = g.__burnless_handle;
  delete g.__burnless_db;
  delete g.__burnless_handle;
  delete g.__burnless_pglite;
  if (handle) await handle.close();
}

/** Normalize a raw db.execute() result to an array (spec §6). */
export function execRows<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : ((result as { rows: T[] }).rows ?? []);
}
