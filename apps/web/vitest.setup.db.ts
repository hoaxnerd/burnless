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
 */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll } from "vitest";

// Import schema from the raw source path — NOT from `@burnless/db` — so that
// `packages/db/src/index.ts` is NOT evaluated here (which would capture the
// wrong globalThis.__burnless_db value if it were undefined at this point).
import * as schema from "../../packages/db/src/schema";

// ── Synchronous top-level setup ───────────────────────────────────────────────
// These three lines run BEFORE any test-file import resolves @burnless/db.

const pglite = new PGlite();
const testDb = drizzle(pglite, { schema });

// CRITICAL: assign before @burnless/db/index.ts first evaluates.
(globalThis as unknown as { __burnless_db?: unknown }).__burnless_db = testDb;

// Also expose the PGlite instance so @db-test/setup can detect that it should
// reuse this instance (and skip creating a second, divergent PGLite db).
(globalThis as unknown as { __burnless_pglite?: unknown }).__burnless_pglite = pglite;

// ── Async setup: apply migrations ────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigrations(client: PGlite) {
  const migrationsDir = join(__dirname, "../../packages/db/drizzle");
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists") || msg.includes("duplicate_object")) {
          continue;
        }
        throw new Error(`Migration ${file} failed: ${msg}`);
      }
    }
  }
}

beforeAll(async () => {
  await runMigrations(pglite);
});

afterAll(async () => {
  delete (globalThis as unknown as { __burnless_db?: unknown }).__burnless_db;
  delete (globalThis as unknown as { __burnless_pglite?: unknown }).__burnless_pglite;
  await pglite.close();
});
