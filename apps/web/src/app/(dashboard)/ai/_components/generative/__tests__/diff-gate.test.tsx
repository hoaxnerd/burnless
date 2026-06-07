// apps/web/src/app/(dashboard)/ai/_components/generative/__tests__/diff-gate.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiffGate } from "../diff-gate";
import type { ScenarioOverrideDelta } from "../../types";

describe("DiffGate", () => {
  it("create: shows the entity header + new field values, no system fields", () => {
    const override: ScenarioOverrideDelta[] = [
      { action: "create", entityType: "revenue_stream", entityId: "id1", before: null,
        after: { id: "id1", companyId: "c1", name: "Pro Plan", type: "subscription", createdAt: "x" } },
    ];
    render(<DiffGate override={override} />);
    expect(screen.getByText(/create/i)).toBeTruthy();
    expect(screen.getByText(/revenue stream/i)).toBeTruthy();
    expect(screen.getByText("Pro Plan")).toBeTruthy();
    // system fields are hidden
    expect(screen.queryByText("id1")).toBeNull();
    expect(screen.queryByText("c1")).toBeNull();
  });

  it("modify: shows only changed fields as before → after", () => {
    const override: ScenarioOverrideDelta[] = [
      { action: "modify", entityType: "revenue_stream", entityId: "id1",
        before: { id: "id1", name: "Old", type: "subscription" },
        after: { id: "id1", name: "New", type: "subscription" } },
    ];
    render(<DiffGate override={override} />);
    expect(screen.getByText("Old")).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
    // unchanged field 'type' is not shown
    expect(screen.queryAllByText("subscription")).toHaveLength(0);
  });

  it("delete: shows the delete header + the removed entity's identifying field", () => {
    const override: ScenarioOverrideDelta[] = [
      { action: "delete", entityType: "headcount_plan", entityId: "h1",
        before: { id: "h1", title: "Engineer" }, after: null },
    ];
    render(<DiffGate override={override} />);
    expect(screen.getByText(/delete/i)).toBeTruthy();
    expect(screen.getByText("Engineer")).toBeTruthy();
  });

  it("remove_override: framed as removing a scenario change", () => {
    const override: ScenarioOverrideDelta[] = [
      { action: "remove_override", entityType: "revenue_stream", entityId: "id1",
        before: { id: "id1", name: "Scenario Only" }, after: null },
    ];
    render(<DiffGate override={override} />);
    expect(screen.getByText(/remove/i)).toBeTruthy();
    expect(screen.getByText("Scenario Only")).toBeTruthy();
  });

  it("renders multiple entities (cascade)", () => {
    const override: ScenarioOverrideDelta[] = [
      { action: "delete", entityType: "department", entityId: "d1", before: { id: "d1", name: "Parent" }, after: null },
      { action: "delete", entityType: "department", entityId: "d2", before: { id: "d2", name: "Child" }, after: null },
    ];
    render(<DiffGate override={override} />);
    expect(screen.getByText("Parent")).toBeTruthy();
    expect(screen.getByText("Child")).toBeTruthy();
  });
});
