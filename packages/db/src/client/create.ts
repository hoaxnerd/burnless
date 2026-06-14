import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { Extension } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
// NOTE: the two drivers (drizzle-orm/postgres-js + `postgres`, and drizzle-orm/pglite)
// are LAZY-loaded per branch below — never both. This keeps the unused driver out of
// the boot path: the self-host single binary in PGLite mode must not require the `postgres`
// pg driver (it isn't embedded), and cloud need not load PGLite's WASM. (S5 derisk.)
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

/**
 * pgvector loadable-extension for PGLite, with a BUNDLER- and Bun-compile-proof
 * bundle path.
 *
 * We deliberately do NOT `import { vector } from "@electric-sql/pglite-pgvector"`:
 * its `setup` resolves `vector.tar.gz` via `new URL("./vector.tar.gz", import.meta.url)`,
 * which Next/webpack rewrites into an unresolvable `/_next/static/media/*` URL in the
 * standalone artifact (→ "Extension bundle not found", crashing the boot/instrumentation
 * hook) and which Bun freezes to the build-host path in a compiled binary. Instead we
 * build our own `{ name, setup }` whose `bundlePath` is a REAL file resolved at runtime:
 *   1. `BURNLESS_PGLITE_VECTOR_BUNDLE` env (the standalone/binary launcher stages the
 *      tarball and sets this — same escape-hatch pattern as `BURNLESS_MIGRATIONS_DIR`);
 *   2. else `createRequire`-resolved from node_modules (dev / unbundled / direct vitest).
 *
 * PGLite (self-host) ONLY — the Postgres/cloud branch never calls this.
 */
function pgliteVectorExtension(): Extension {
  const fromEnv = process.env.BURNLESS_PGLITE_VECTOR_BUNDLE?.trim();
  // The package's `exports` map blocks the `./dist/vector.tar.gz` subpath, so
  // resolve the package main (allowed) and derive the sibling tarball next to it.
  const bundlePath = fromEnv
    ? pathToFileURL(fromEnv)
    : new URL(
        "./vector.tar.gz",
        pathToFileURL(
          createRequire(import.meta.url).resolve("@electric-sql/pglite-pgvector"),
        ),
      );
  return {
    name: "vector",
    setup: async (_pg, emscriptenOpts) => ({ emscriptenOpts, bundlePath }),
  };
}

/** Build the Drizzle client for the resolved driver. See spec §4. */
export async function createClient(resolved: ResolvedDriver): Promise<DbHandle> {
  if (resolved.driver === "postgres") {
    const { drizzle: drizzlePostgres } = await import("drizzle-orm/postgres-js");
    const { default: postgres } = await import("postgres");
    // prepare:false → use the simple query protocol so we work through a
    // transaction-mode connection pooler (Neon/Supabase PgBouncer, the standard
    // serverless setup), which rejects prepared/named statements. Harmless on a
    // direct connection. max:10 caps per-instance connections.
    const client = postgres(resolved.connectionString, { max: 10, prepare: false });
    return {
      db: drizzlePostgres(client, { schema }),
      dialect: "postgres",
      raw: client,
      close: () => client.end(),
    };
  }

  mkdirSync(resolved.dataDir, { recursive: true });
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const pglite = await PGlite.create(resolved.dataDir, {
    extensions: { vector: pgliteVectorExtension() },
  });
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
