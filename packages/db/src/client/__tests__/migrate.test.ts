import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { createClient } from "../create";
import { applyMigrations } from "../migrate";

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "bl-migrate-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("applyMigrations (pglite)", () => {
  it("creates the schema (companies table exists) and enables vector", async () => {
    const handle = await createClient({ driver: "pglite", dataDir: join(tmp(), "data") });
    await applyMigrations(handle);

    const tbl = await handle.db.execute(
      sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'companies'`,
    );
    const tblRows = Array.isArray(tbl) ? tbl : (tbl as { rows: unknown[] }).rows;
    expect(tblRows.length).toBe(1);

    const ext = await handle.db.execute(
      sql`SELECT 1 FROM pg_extension WHERE extname = 'vector'`,
    );
    const extRows = Array.isArray(ext) ? ext : (ext as { rows: unknown[] }).rows;
    expect(extRows.length).toBe(1);

    await handle.close();
  });
});
