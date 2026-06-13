/**
 * Local DB ops — direct in-process via @burnless/db's pure helpers (resolveDriver →
 * createClient → applyMigrations). Does NOT touch the `db` Proxy / initDatabase /
 * instrumentation — these run with NO server up (spec L1, recovery + pre-start).
 */
import { applyMigrations, createClient, resolveDriver, type DbHandle } from "@burnless/db";
import { sql } from "drizzle-orm";

async function withHandle<T>(fn: (h: DbHandle) => Promise<T>): Promise<T> {
  const handle = await createClient(resolveDriver(process.env));
  try {
    return await fn(handle);
  } finally {
    await handle.close();
  }
}

export interface MigrateResult {
  driver: "postgres" | "pglite";
}

export async function runMigrate(): Promise<MigrateResult> {
  return withHandle(async (h) => {
    await applyMigrations(h);
    return { driver: h.dialect };
  });
}

export interface DbStatus {
  driver: "postgres" | "pglite";
  connected: boolean;
}

export async function dbStatus(): Promise<DbStatus> {
  return withHandle(async (h) => {
    await h.db.execute(sql`SELECT 1`);
    return { driver: h.dialect, connected: true };
  });
}
