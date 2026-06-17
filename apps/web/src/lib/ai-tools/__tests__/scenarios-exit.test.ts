/**
 * Tests for the exit_scenario AI tool handler.
 *
 * Stubs compute-dashboard (which scenarios.ts imports for get_scenario_comparison)
 * to keep the import graph from pulling the next-auth chain into the test runtime —
 * consistent with activate-scenario.test.ts. exit_scenario itself does no DB access.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../../compute-dashboard", () => ({ computeDashboardData: vi.fn() }));

import { scenarioHandlers, scenarioSchemas } from "../scenarios";

describe("exit_scenario tool", () => {
  it("is registered with an empty schema and returns an exited envelope", async () => {
    expect(scenarioSchemas.exit_scenario).toBeDefined();
    const handler = scenarioHandlers.exit_scenario!;
    const raw = await handler({}, { userId: "u", companyId: "c" });
    const parsed = JSON.parse(raw);
    expect(parsed).toMatchObject({ success: true, exited: true });
  });
});
