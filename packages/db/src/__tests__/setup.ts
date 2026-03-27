import { beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "../schema";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle>;

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
      } catch (err: any) {
        // Tolerate "already exists" errors from overlapping migrations
        // (e.g. enum created in both a manual and drizzle-generated migration)
        const msg: string = err?.message ?? "";
        if (msg.includes("already exists") || msg.includes("duplicate_object")) {
          continue;
        }
        throw new Error(`Migration ${file} failed: ${msg}`);
      }
    }
  }
}

// Vitest global setup — runs once before all tests in this package
beforeAll(async () => {
  pglite = new PGlite();
  await runMigrations(pglite);
  testDb = drizzle(pglite, { schema });
});

afterAll(async () => {
  await pglite.close();
});
