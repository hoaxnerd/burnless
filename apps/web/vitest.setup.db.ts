/**
 * PGLite test-DB setup for apps/web integration tests.
 *
 * WHY globalThis.__burnless_db (not vi.mock):
 * `packages/db/src/queries/scenario-resolver.ts` imports `db` via the
 * relative path `import { db } from "../index"`. A vi.mock("@burnless/db")
 * in the test file intercepts only the `@burnless/db` specifier — it does NOT
 * intercept the relative import inside the package. The resolver therefore ran
 * against the unconnected production `db`, returning empty overrides.
 *
 * The production module (`packages/db/src/index.ts`) initialises via:
 *
 *   if (!globalForDb.__burnless_db) { ... }
 *   export const db = globalForDb.__burnless_db;
 *
 * If we assign `globalThis.__burnless_db` BEFORE `packages/db/src/index.ts`
 * is first evaluated, the module captures our PGLite instance. Both the
 * public `db` export and every relative `import { db } from "../index"` inside
 * the package (including scenario-resolver.ts) then share this instance.
 *
 * TIMING: vitest evaluates `setupFiles` before the test file's own imports.
 * This file's top-level code (synchronous) runs before any test-file import
 * chain can trigger `@burnless/db`. We import schema from the raw source path
 * (not from the `@burnless/db` barrel) to avoid triggering index.ts early.
 *
 * NOTE: this relies on Vitest's default (threads, shared VM context) runner.
 * With `vmThreads` + `isolate: true`, globalThis is not shared across modules
 * and this hijack would break — we'd need to switch to a forked runner or
 * use a different mechanism (e.g., test-time DI of the db instance).
 */

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll } from "vitest";

// Import schema from the raw source path — NOT from `@burnless/db` — so that
// `packages/db/src/index.ts` is NOT evaluated here (which would capture the
// wrong globalThis.__burnless_db value if it were undefined at this point).
import * as schema from "../../packages/db/src/schema";

// ── Synchronous top-level setup ───────────────────────────────────────────────
// These three lines run BEFORE any test-file import resolves @burnless/db.

// Load the pgvector extension so migrations that declare `vector(...)` columns
// (e.g. the `memory` table) apply — mirrors the production client in
// packages/db/src/client/create.ts and the @db-test setup. CREATE EXTENSION is
// issued in beforeAll (below) before migrations run.
const pglite = new PGlite({ extensions: { vector } });
const testDb = drizzle(pglite, { schema });

// CRITICAL: assign before @burnless/db/index.ts first evaluates.
(globalThis as unknown as { __burnless_db?: unknown }).__burnless_db = testDb;

// Also expose the PGlite instance so @db-test/setup can detect that it should
// reuse this instance (and skip creating a second, divergent PGLite db).
(globalThis as unknown as { __burnless_pglite?: unknown }).__burnless_pglite = pglite;

// ── Async setup: apply migrations ────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

// Apply the Drizzle migration baseline via drizzle's own PGLite migrator
// (reads packages/db/drizzle/meta/_journal.json — same code path as prod
// `db:migrate`). Replaces the prior hand-rolled SQL-file glob (H1: kept in
// lockstep with packages/db/src/__tests__/setup.ts).
async function runMigrations(client: PGlite) {
  const migrationsFolder = join(__dirname, "../../packages/db/drizzle");
  const dbForMigrate = drizzle(client, { schema });
  await migrate(dbForMigrate, { migrationsFolder });
}

beforeAll(async () => {
  await testDb.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await runMigrations(pglite);
});

afterAll(async () => {
  delete (globalThis as unknown as { __burnless_db?: unknown }).__burnless_db;
  delete (globalThis as unknown as { __burnless_pglite?: unknown }).__burnless_pglite;
  await pglite.close();
});
