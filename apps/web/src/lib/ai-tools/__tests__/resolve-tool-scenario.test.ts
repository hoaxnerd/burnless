/**
 * resolveToolScenario (spec §4.4) — explicit per-call scenario target resolution.
 *
 * Uses the real PGLite-backed DB (no mocks for DB semantics). Setup mirrors
 * src/lib/__tests__/scenario-read-path.test.ts: importing "@db-test/setup"
 * triggers the apps/web vitest.setup.db.ts globalThis hijack so @burnless/db's
 * singleton captures the PGLite instance, and the real factories create rows.
 */

import { describe, it, expect, beforeEach } from "vitest";
import "@db-test/setup";
import { createUser, createCompany } from "@db-test/factories";
import { db, scenarios } from "@burnless/db";
import { resolveToolScenario } from "../resolve-tool-scenario";

describe("resolveToolScenario (PGLite)", () => {
  let companyId: string;
  let scenarioId: string;

  beforeEach(async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    companyId = company.id;
    const [s] = await db
      .insert(scenarios)
      .values({ companyId, name: "S", source: "ai" })
      .returning();
    scenarioId = s!.id;
  });

  it("undefined → turn target (ctx.scenarioId)", async () => {
    expect(await resolveToolScenario(undefined, { userId: "u", companyId, scenarioId })).toEqual({
      ok: true,
      scenarioId,
    });
  });

  it('"base" → null', async () => {
    expect(await resolveToolScenario("base", { userId: "u", companyId, scenarioId })).toEqual({
      ok: true,
      scenarioId: null,
    });
  });

  it("valid owned UUID → that id", async () => {
    expect(await resolveToolScenario(scenarioId, { userId: "u", companyId, scenarioId: null })).toEqual({
      ok: true,
      scenarioId,
    });
  });

  it("foreign/unknown id → error, no write", async () => {
    const r = await resolveToolScenario("00000000-0000-4000-a000-000000000999", {
      userId: "u",
      companyId,
      scenarioId: null,
    });
    expect(r.ok).toBe(false);
  });
});
