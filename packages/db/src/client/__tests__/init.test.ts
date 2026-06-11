import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type G = { __burnless_db?: unknown; __burnless_pglite?: unknown; __burnless_handle?: unknown };
const g = globalThis as unknown as G;

let savedDb: unknown;
let savedPglite: unknown;
let savedHandle: unknown;
const dirs: string[] = [];

beforeEach(() => {
  // setup.ts pre-seeds these; stash + clear so we test the real init path.
  savedDb = g.__burnless_db;
  savedPglite = g.__burnless_pglite;
  savedHandle = g.__burnless_handle;
  delete g.__burnless_db;
  delete g.__burnless_pglite;
  delete g.__burnless_handle;
});

afterEach(async () => {
  const { closeDatabase } = await import("../../index");
  await closeDatabase();
  g.__burnless_db = savedDb;
  g.__burnless_pglite = savedPglite;
  g.__burnless_handle = savedHandle;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("initDatabase + db proxy", () => {
  it("throws when db proxy is dereferenced before init (pglite path)", async () => {
    // No DATABASE_URL -> pglite, which cannot lazy-sync.
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const { db } = await import("../../index");
      expect(() => (db as { select: unknown }).select).toThrow(/not initialized/i);
    } finally {
      if (prev !== undefined) process.env.DATABASE_URL = prev;
    }
  });

  it("initDatabase is idempotent (same instance, second call is a no-op)", async () => {
    const dataDir = join((() => { const d = mkdtempSync(join(tmpdir(), "bl-init-")); dirs.push(d); return d; })(), "data");
    const prevUrl = process.env.DATABASE_URL;
    const prevDir = process.env.BURNLESS_DATA_DIR;
    delete process.env.DATABASE_URL;
    process.env.BURNLESS_DATA_DIR = dataDir;
    try {
      const { initDatabase } = await import("../../index");
      const a = await initDatabase();
      const b = await initDatabase();
      expect(a).toBe(b);
    } finally {
      if (prevUrl !== undefined) process.env.DATABASE_URL = prevUrl; else delete process.env.DATABASE_URL;
      if (prevDir !== undefined) process.env.BURNLESS_DATA_DIR = prevDir; else delete process.env.BURNLESS_DATA_DIR;
    }
  });
});

describe("execRows", () => {
  it("normalizes both array and {rows} shapes", async () => {
    const { execRows } = await import("../../index");
    expect(execRows([1, 2])).toEqual([1, 2]);
    expect(execRows({ rows: [3, 4] })).toEqual([3, 4]);
  });
});
