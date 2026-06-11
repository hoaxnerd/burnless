import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import type { ResolvedDriver } from "./resolve";
import type { Dialect } from "./migrate";
import type { Database } from "../index";

export interface DbHandle {
  db: Database;
  dialect: Dialect;
  raw: unknown;
  close(): Promise<void>;
}

/** Build the Drizzle client for the resolved driver. See spec §4. */
export async function createClient(resolved: ResolvedDriver): Promise<DbHandle> {
  if (resolved.driver === "postgres") {
    const client = postgres(resolved.connectionString, { max: 10 });
    return {
      db: drizzlePostgres(client, { schema }),
      dialect: "postgres",
      raw: client,
      close: () => client.end(),
    };
  }

  mkdirSync(resolved.dataDir, { recursive: true });
  const pglite = await PGlite.create(resolved.dataDir, { extensions: { vector } });
  // PGLite-drizzle is runtime-identical for the query builder; cast to the
  // single public Database type (spec §6) so the 254 importers stay unchanged.
  const db = drizzlePglite(pglite, { schema });
  // CREATE EXTENSION vector runs at client creation — independent of the
  // migrate gate — so a pglite instance always has vector available even when
  // BURNLESS_AUTO_MIGRATE is disabled. (spec §5)
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  return {
    db: db as unknown as Database,
    dialect: "pglite",
    raw: pglite,
    close: () => pglite.close(),
  };
}
