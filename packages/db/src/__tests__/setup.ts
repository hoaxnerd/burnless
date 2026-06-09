import { beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "../schema";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle>;
// Set to true when this module reuses an instance created externally (e.g. by
// apps/web/vitest.setup.db.ts). In that case afterAll skips close() since the
// external setup owns the lifecycle.
let externalInstance = false;

/**
 * Get the shared PGLite-backed Drizzle instance for tests.
 * Migrations are applied once per test suite via the global setup below.
 */
export function getTestDb() {
  if (!testDb) {
    throw new Error("Test DB not initialized — is setup.ts loaded as a vitest setupFile?");
  }
  return testDb;
}

/**
 * Apply the Drizzle migration baseline to the PGLite instance using drizzle's
 * own PGLite migrator (reads drizzle/meta/_journal.json — same code path as
 * prod `db:migrate`). Replaces the prior hand-rolled SQL-file glob.
 */
async function runMigrations(client: PGlite) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const migrationsFolder = join(__dirname, "../../drizzle");
  const dbForMigrate = drizzle(client, { schema });
  await migrate(dbForMigrate, { migrationsFolder });
}

// Vitest global setup — runs once before all tests in this package.
//
// When apps/web/vitest.setup.db.ts has already created a PGLite instance and
// assigned it to globalThis.__burnless_db (and __burnless_pglite), this hook
// reuses that instance. This ensures that factories (which call getTestDb())
// and scenario-resolver.ts (which imports db from "../index", which reads
// globalThis.__burnless_db) all operate on the same in-memory database.
beforeAll(async () => {
  const g = globalThis as unknown as {
    __burnless_db?: ReturnType<typeof drizzle>;
    __burnless_pglite?: PGlite;
  };

  if (g.__burnless_db && g.__burnless_pglite) {
    // External setup (e.g. apps/web/vitest.setup.db.ts) already created and
    // migrated the db. Reuse it — migrations have already been applied.
    testDb = g.__burnless_db;
    pglite = g.__burnless_pglite;
    externalInstance = true;
    return;
  }

  pglite = new PGlite();
  await runMigrations(pglite);
  testDb = drizzle(pglite, { schema });
  // Seed the globalThis singleton so packages/db/src/index.ts (and any
  // relative `import { db } from "../index"` in queries) see the same
  // PGLite instance instead of opening a production postgres connection.
  g.__burnless_db = testDb;
  g.__burnless_pglite = pglite;
});

afterAll(async () => {
  if (externalInstance) return; // lifecycle owned by the external setup file
  const g = globalThis as unknown as { __burnless_db?: unknown; __burnless_pglite?: unknown };
  delete g.__burnless_db;
  delete g.__burnless_pglite;
  await pglite.close();
});
