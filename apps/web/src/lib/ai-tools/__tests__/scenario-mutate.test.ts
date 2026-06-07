import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  planScenarioInsert,
  scenarioInsert,
  planScenarioUpdate,
  scenarioUpdate,
  planScenarioDelete,
  scenarioDelete,
} = vi.hoisted(() => {
  const planScenarioInsert = vi.fn(async () => ({ action: "create", entityType: "revenue_stream", entityId: "id1", before: null, after: { id: "id1", name: "X" } }));
  const scenarioInsert = vi.fn(async () => ({ id: "id1", name: "X" }));
  const planScenarioUpdate = vi.fn(async () => ({ action: "modify", entityType: "revenue_stream", entityId: "id1", before: { name: "old" }, after: { id: "id1", name: "new" } }));
  const scenarioUpdate = vi.fn(async () => ({ id: "id1", name: "new" }));
  const planScenarioDelete = vi.fn(async () => [{ action: "delete", entityType: "department", entityId: "d1", before: {}, after: null }, { action: "delete", entityType: "department", entityId: "d2", before: {}, after: null }]);
  const scenarioDelete = vi.fn(async () => true);
  return { planScenarioInsert, scenarioInsert, planScenarioUpdate, scenarioUpdate, planScenarioDelete, scenarioDelete };
});

vi.mock("@burnless/db", () => ({ planScenarioInsert, scenarioInsert, planScenarioUpdate, scenarioUpdate, planScenarioDelete, scenarioDelete }));

import { mutateInsert, mutateUpdate, mutateDelete, planResultJson } from "../scenario-mutate";

beforeEach(() => {
  planScenarioInsert.mockClear();
  scenarioInsert.mockClear();
  planScenarioUpdate.mockClear();
  scenarioUpdate.mockClear();
  planScenarioDelete.mockClear();
  scenarioDelete.mockClear();
});

const table = {} as never;

describe("scenario-mutate facade", () => {
  it("commit mode calls scenarioInsert and returns the row", async () => {
    const res = await mutateInsert({ companyId: "c1", userId: "u1", scenarioId: "s1", mode: "commit" }, "revenue_stream", table, { name: "X" });
    expect(scenarioInsert).toHaveBeenCalled();
    expect(planScenarioInsert).not.toHaveBeenCalled();
    expect("row" in res && res.row).toMatchObject({ id: "id1" });
  });

  it("plan mode calls planScenarioInsert, never writes, returns the delta array", async () => {
    const res = await mutateInsert({ companyId: "c1", userId: "u1", scenarioId: "s1", mode: "plan" }, "revenue_stream", table, { name: "X" });
    expect(planScenarioInsert).toHaveBeenCalled();
    expect(scenarioInsert).not.toHaveBeenCalled();
    expect("planned" in res && res.planned[0]?.action).toBe("create");
  });

  it("plan mode requires a scenario", async () => {
    await expect(
      mutateInsert({ companyId: "c1", userId: "u1", mode: "plan" }, "revenue_stream", table, { name: "X" }),
    ).rejects.toThrow(/scenario/i);
  });

  it("mutateUpdate commit mode calls scenarioUpdate (writes), not planScenarioUpdate", async () => {
    const res = await mutateUpdate({ companyId: "c1", userId: "u1", scenarioId: "s1", mode: "commit" }, "revenue_stream", table, "id1", { name: "new" });
    expect(scenarioUpdate).toHaveBeenCalled();
    expect(planScenarioUpdate).not.toHaveBeenCalled();
    expect("row" in res).toBe(true);
  });

  it("mutateUpdate plan mode calls planScenarioUpdate (no write), returns the delta", async () => {
    const res = await mutateUpdate({ companyId: "c1", userId: "u1", scenarioId: "s1", mode: "plan" }, "revenue_stream", table, "id1", { name: "new" });
    expect(planScenarioUpdate).toHaveBeenCalled();
    expect(scenarioUpdate).not.toHaveBeenCalled();
    expect("planned" in res && res.planned[0]?.action).toBe("modify");
  });

  it("mutateDelete plan mode returns the full cascade array", async () => {
    const res = await mutateDelete({ companyId: "c1", userId: "u1", scenarioId: "s1", mode: "plan" }, "department", table, "d1");
    expect("planned" in res && res.planned).toHaveLength(2);
  });

  it("mutateDelete commit mode calls scenarioDelete (writes), returns deleted flag", async () => {
    const res = await mutateDelete({ companyId: "c1", userId: "u1", scenarioId: "s1", mode: "commit" }, "department", table, "d1");
    expect(scenarioDelete).toHaveBeenCalled();
    expect("deleted" in res && res.deleted).toBe(true);
  });

  it("planResultJson wraps overrides in a stable envelope", () => {
    const json = JSON.parse(planResultJson([{ action: "create", entityType: "x", entityId: "1", before: null, after: {} }]));
    expect(json.planned).toBe(true);
    expect(json.overrides).toHaveLength(1);
  });
});
