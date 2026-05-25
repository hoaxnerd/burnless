import { beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
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
 * Run all Drizzle SQL migrations against the PGLite instance in order.
 * Each migration file may contain multiple statements separated by `--> statement-breakpoint`.
 */
async function runMigrations(client: PGlite) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const migrationsDir = join(__dirname, "../../drizzle");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      try {
        await client.exec(stmt);
      } catch (err: unknown) {
        // Tolerate "already exists" errors from overlapping migrations
        // (e.g. enum created in both a manual and drizzle-generated migration)
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists") || msg.includes("duplicate_object")) {
          continue;
        }
        throw new Error(`Migration ${file} failed: ${msg}`);
      }
    }
  }
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
