// @vitest-environment node
/**
 * Currency-change validation tests for PATCH /api/company.
 *
 * Uses a real PGLite database so that hasFinancialData runs real SQL against
 * actual seeded data — no stubbing of return values.
 * Auth helpers are mocked to avoid Next-Auth's live session store.
 *
 * Note on module wiring: vi.mock("@burnless/db") + importActual creates a
 * separate module instance whose hasFinancialData captures the postgres `db`,
 * not PGLite. We therefore provide hasFinancialData explicitly in the mock
 * using getTestDb() — same SQL as the real function, just wired to PGLite.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── PGLite setup ──────────────────────────────────────────────────────────────

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle>;

function getTestDb() {
  if (!testDb) throw new Error("Test DB not initialized — beforeAll not yet run");
  return testDb;
}

async function runMigrations(client: PGlite) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // Walk up: __tests__ → company → api → app → src → web → apps → (workspace root)
  const migrationsDir = join(
    __dirname,
    "..",   // company
    "..",   // api
    "..",   // app
    "..",   // src
    "..",   // web (apps/web)
    "..",   // apps
    "..",   // workspace root
    "packages",
    "db",
    "drizzle"
  );
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const rawSql = readFileSync(join(migrationsDir, file), "utf-8");
    const statements = rawSql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      try {
        await client.exec(stmt);
      } catch (err: unknown) {
        const msg: string = (err as { message?: string })?.message ?? "";
        if (msg.includes("already exists") || msg.includes("duplicate_object")) {
          continue;
        }
        throw new Error(`Migration ${file} failed: ${msg}`);
      }
    }
  }
}

// ── Auth mocks (hoisted so vi.mock factories can reference them) ──────────────

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

// ── Mock @burnless/db ─────────────────────────────────────────────────────────
//
// We use importActual for schema objects (tables, relations, etc.) but must
// NOT rely on importActual's hasFinancialData — that copy captures the postgres
// `db` from the original module instance (bypassed by importActual). Instead we
// provide hasFinancialData with the same SQL logic wired to getTestDb().

vi.mock("@burnless/db", async (importActual) => {
  const actual = await importActual<typeof import("@burnless/db")>();

  return {
    ...actual,

    // Override `db` with a lazy getter — PGLite not ready until beforeAll
    get db() {
      return getTestDb();
    },

    // hasFinancialData: same SQL as the real implementation, wired to PGLite.
    // (importActual's copy captures postgres db, not our PGLite instance.)
    hasFinancialData: async (companyId: string): Promise<boolean> => {
      const db = getTestDb();
      const result = await db.execute<{ has: boolean }>(sql`
        SELECT (
          EXISTS(SELECT 1 FROM revenue_streams   WHERE company_id = ${companyId})
          OR EXISTS(SELECT 1 FROM transactions   WHERE company_id = ${companyId})
          OR EXISTS(SELECT 1 FROM headcount_plans WHERE company_id = ${companyId})
          OR EXISTS(SELECT 1 FROM funding_rounds  WHERE company_id = ${companyId})
        ) AS has
      `);
      return result.rows[0]?.has === true;
    },
  };
});

// ── Mock @/lib/api-helpers: auth stubs + real-ish parseBody/withErrorHandler ──

vi.mock("@/lib/api-helpers", async () => {
  const { NextResponse } = await import("next/server");
  const { ConfirmableError, serializeConfirmable } = await import(
    "@/lib/confirmable-error"
  );

  return {
    requireCompanyAccess: mockRequireCompanyAccess,
    requireRole: mockRequireRole,

    // Mirrors the real parseBody: returns Zod's error message so test 1
    // can assert that the response body mentions "currency".
    parseBody: async (
      req: Request,
      schema: { parse: (d: unknown) => unknown }
    ) => {
      try {
        const body = await req.json();
        return { data: schema.parse(body) };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Invalid request body";
        return {
          error: NextResponse.json({ error: message }, { status: 400 }),
        };
      }
    },

    errorResponse: (msg: string, status: number) =>
      NextResponse.json({ error: msg }, { status }),

    // Minimal withErrorHandler: handles ConfirmableError → 409.
    withErrorHandler:
      (fn: (...args: unknown[]) => Promise<unknown>) =>
      async (...args: unknown[]) => {
        try {
          return await fn(...args);
        } catch (e) {
          if (e instanceof ConfirmableError) {
            return NextResponse.json(serializeConfirmable(e), { status: 409 });
          }
          throw e;
        }
      },
  };
});

// ── Import handler AFTER all mocks are declared ───────────────────────────────

import { PATCH } from "../route";
import * as dbSchema from "@burnless/db";

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonRequest(url: string, body?: unknown): Request {
  return new Request(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

let companyId: string;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  pglite = new PGlite();
  await runMigrations(pglite);
  const { schema } = await import("@burnless/db");
  testDb = drizzle(pglite, { schema });
}, 30_000);

beforeEach(async () => {
  const db = getTestDb();
  const { users, companies, companyMembers } = dbSchema;
  const { eq } = await import("drizzle-orm");

  // Fresh company per test — currency defaults to "USD"
  const userId = crypto.randomUUID();
  companyId = crypto.randomUUID();

  await db.insert(users).values({
    id: userId,
    email: `test-${userId.slice(-6)}@test.burnless.app`,
    name: "Test User",
  });

  await db.insert(companies).values({
    id: companyId,
    name: "Test Company",
    ownerId: userId,
    currency: "USD",
  });

  await db.insert(companyMembers).values({
    id: crypto.randomUUID(),
    companyId,
    userId,
    role: "admin",
  });

  mockRequireCompanyAccess.mockResolvedValue({
    userId,
    companyId,
    role: "admin",
  });
  mockRequireRole.mockReturnValue(null);

  // Ensure no leftover revenue streams from a prior test
  await db
    .delete(dbSchema.revenueStreams)
    .where(eq(dbSchema.revenueStreams.companyId, companyId));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PATCH /api/company — currency validation", () => {
  it("1. rejects a non-whitelist currency code with 400", async () => {
    const req = jsonRequest("http://localhost/api/company", { currency: "XYZ" });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    // Zod's ZodError.message serialises the issues array which contains
    // the field path ["currency"], so the string includes "currency".
    expect(body.error).toMatch(/currency/i);
  });

  it("2. accepts a whitelist currency code when no financial data exists", async () => {
    // No revenue streams — hasFinancialData returns false — no confirm needed
    const req = jsonRequest("http://localhost/api/company", { currency: "EUR" });
    const res = await PATCH(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currency).toBe("EUR");
  });

  it("3. returns 409 requiresConfirmation when financial data exists and confirm missing", async () => {
    const db = getTestDb();
    await db.insert(dbSchema.revenueStreams).values({
      id: crypto.randomUUID(),
      companyId,
      name: "MRR",
    });

    const req = jsonRequest("http://localhost/api/company", { currency: "EUR" });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("CURRENCY_CHANGE_REQUIRES_CONFIRMATION");
    expect(body.requiresConfirmation).toBe(true);
    expect(body.details).toMatchObject({ from: "USD", to: "EUR" });
  });

  it("4. persists currency change when ?confirm=true and financial data exists", async () => {
    const db = getTestDb();
    await db.insert(dbSchema.revenueStreams).values({
      id: crypto.randomUUID(),
      companyId,
      name: "MRR",
    });

    const req = jsonRequest(
      "http://localhost/api/company?confirm=true",
      { currency: "EUR" }
    );
    const res = await PATCH(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currency).toBe("EUR");

    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select()
      .from(dbSchema.companies)
      .where(eq(dbSchema.companies.id, companyId));
    expect(row?.currency).toBe("EUR");
  });

  it("5. does NOT fire confirm gate when currency is unchanged (other fields only)", async () => {
    // Revenue stream present — but body doesn't include currency, so gate is skipped
    const db = getTestDb();
    await db.insert(dbSchema.revenueStreams).values({
      id: crypto.randomUUID(),
      companyId,
      name: "MRR",
    });

    const req = jsonRequest("http://localhost/api/company", { name: "Renamed" });
    const res = await PATCH(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Renamed");
  });
});
