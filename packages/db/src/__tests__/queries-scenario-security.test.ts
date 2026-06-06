import { describe, it, expect, beforeAll, vi } from "vitest";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import {
  scenarioInsert,
  scenarioUpdate,
  scenarioDelete,
} from "../queries/scenario-mutations";
import { getOverridesForScenario } from "../queries/scenario-overrides";
import { createCompanyContext, createRevenueStream } from "./factories";
import { revenueStreams } from "../schema";
import { eq } from "drizzle-orm";

/**
 * SECURITY: scenario mutations must be company-scoped. A caller acting for
 * company B must never be able to read, update, or delete an entity that
 * belongs to company A by passing A's entity id. companyId is the trust
 * boundary; the helpers enforce `WHERE id = ? AND company_id = ?` on every
 * base-table op and base snapshot, and verify the scenario belongs to the
 * company before writing an override.
 */
describe("scenario mutations are company-scoped (cross-tenant IDOR guard)", () => {
  it("scenarioUpdate base-mode does NOT update another company's row", async () => {
    const a = await createCompanyContext({
      user: { email: "sec-a1@test.burnless.app" },
      company: { name: "Company A1" },
    });
    const b = await createCompanyContext({
      user: { email: "sec-b1@test.burnless.app" },
      company: { name: "Company B1" },
    });
    const aStream = await createRevenueStream(a.company.id, { name: "A original" });

    // B tries to update A's stream by id, in base mode (scenarioId=null).
    const result = await scenarioUpdate(
      "revenue_stream",
      revenueStreams,
      aStream.id,
      { name: "hacked by B" },
      null,
      b.company.id,
    );

    expect(result).toBeFalsy(); // no row returned — not owned
    const db = getTestDb();
    const [row] = await db
      .select()
      .from(revenueStreams)
      .where(eq(revenueStreams.id, aStream.id));
    expect(row!.name).toBe("A original"); // untouched
  });

  it("scenarioUpdate base-mode DOES update the owning company's row", async () => {
    const a = await createCompanyContext({
      user: { email: "sec-a2@test.burnless.app" },
      company: { name: "Company A2" },
    });
    const aStream = await createRevenueStream(a.company.id, { name: "before" });

    const result = await scenarioUpdate(
      "revenue_stream",
      revenueStreams,
      aStream.id,
      { name: "after" },
      null,
      a.company.id,
    );

    expect(result).toBeTruthy();
    expect((result as { name: string }).name).toBe("after");
  });

  it("scenarioDelete base-mode does NOT delete another company's row", async () => {
    const a = await createCompanyContext({
      user: { email: "sec-a3@test.burnless.app" },
      company: { name: "Company A3" },
    });
    const b = await createCompanyContext({
      user: { email: "sec-b3@test.burnless.app" },
      company: { name: "Company B3" },
    });
    const aStream = await createRevenueStream(a.company.id, { name: "keep me" });

    await scenarioDelete("revenue_stream", revenueStreams, aStream.id, null, b.company.id);

    const db = getTestDb();
    const [row] = await db
      .select()
      .from(revenueStreams)
      .where(eq(revenueStreams.id, aStream.id));
    expect(row).toBeDefined(); // still there
  });

  it("scenarioUpdate scenario-mode does NOT snapshot another company's entity (no override created)", async () => {
    const a = await createCompanyContext({
      user: { email: "sec-a4@test.burnless.app" },
      company: { name: "Company A4" },
    });
    const b = await createCompanyContext({
      user: { email: "sec-b4@test.burnless.app" },
      company: { name: "Company B4" },
    });
    const aStream = await createRevenueStream(a.company.id, { name: "A secret" });

    // B, inside B's scenario, tries to modify A's stream by id.
    await expect(
      scenarioUpdate(
        "revenue_stream",
        revenueStreams,
        aStream.id,
        { name: "leak" },
        b.scenario.id,
        b.company.id,
      ),
    ).rejects.toThrow();

    const overrides = await getOverridesForScenario(b.scenario.id, "revenue_stream");
    expect(overrides).toHaveLength(0); // no override capturing A's data
  });

  it("scenario mutation rejects a scenarioId belonging to another company", async () => {
    const a = await createCompanyContext({
      user: { email: "sec-a5@test.burnless.app" },
      company: { name: "Company A5" },
    });
    const b = await createCompanyContext({
      user: { email: "sec-b5@test.burnless.app" },
      company: { name: "Company B5" },
    });

    // B tries to create an entity inside A's scenario.
    await expect(
      scenarioInsert(
        "revenue_stream",
        revenueStreams,
        { companyId: b.company.id, name: "into A's scenario" },
        a.scenario.id,
        b.company.id,
      ),
    ).rejects.toThrow();

    const overrides = await getOverridesForScenario(a.scenario.id, "revenue_stream");
    expect(overrides).toHaveLength(0);
  });
});
