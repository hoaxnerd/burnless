import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { createClient } from "../create";

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "bl-create-"));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("createClient (pglite)", () => {
  it("creates a file-backed pglite handle with the vector extension loaded", async () => {
    const handle = await createClient({ driver: "pglite", dataDir: join(tmp(), "data") });
    expect(handle.dialect).toBe("pglite");
    // vector extension is available to be created
    await handle.db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    const res = await handle.db.execute(sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`);
    const rows = Array.isArray(res) ? res : (res as { rows: unknown[] }).rows;
    expect(rows.length).toBe(1);
    await handle.close();
  });

  it("persists data across reopen of the same dataDir", async () => {
    const dataDir = join(tmp(), "data");
    const h1 = await createClient({ driver: "pglite", dataDir });
    await h1.db.execute(sql`CREATE TABLE t (id int)`);
    await h1.db.execute(sql`INSERT INTO t (id) VALUES (42)`);
    await h1.close();

    const h2 = await createClient({ driver: "pglite", dataDir });
    const res = await h2.db.execute(sql`SELECT id FROM t`);
    const rows = Array.isArray(res) ? res : (res as { rows: { id: number }[] }).rows;
    expect(rows[0].id).toBe(42);
    await h2.close();
  });
});
