/**
 * AI-01 unit test for resolveWriteScenarioId — the WRITE-target resolver that
 * keeps base-view AI writes out of the Base-Case overlay.
 */
import { describe, it, expect } from "vitest";
import { resolveWriteScenarioId } from "../ai-write-target";

describe("resolveWriteScenarioId (AI-01)", () => {
  it("returns null in base view (no body.scenarioId)", () => {
    expect(resolveWriteScenarioId(null, null)).toBeNull();
    expect(resolveWriteScenarioId(undefined, null)).toBeNull();
    // Even if a validated row is somehow present, no selected id = base view.
    expect(resolveWriteScenarioId(null, { id: "scn_1" })).toBeNull();
  });

  it("returns the validated scenario id when an explicit id resolved to this company", () => {
    expect(resolveWriteScenarioId("scn_1", { id: "scn_1" })).toBe("scn_1");
  });

  it("returns null when an explicit id did NOT resolve (validated null = not found)", () => {
    // An unknown/foreign id falls through to base tables — never the Base-Case overlay.
    expect(resolveWriteScenarioId("scn_unknown", null)).toBeNull();
    expect(resolveWriteScenarioId("scn_unknown", undefined)).toBeNull();
  });
});
