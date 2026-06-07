import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const enterScenario = vi.fn();
vi.mock("@/components/scenarios/scenario-context", () => ({
  useScenario: () => ({ activeScenarioId: "other", enterScenario }),
}));

import { ScenarioNode } from "../scenario-node";

describe("ScenarioNode (Plan 5)", () => {
  it("shows the activated scenario name + an Enter button when not active", () => {
    render(<ScenarioNode node={{ id: "s-1", kind: "scenario", scenarioId: "s1", scenarioName: "Aggressive Hiring" }} />);
    expect(screen.getByText(/Aggressive Hiring/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /enter/i })).toBeTruthy();
  });

  it("shows an Active marker when it is the active scenario", () => {
    render(<ScenarioNode node={{ id: "s-2", kind: "scenario", scenarioId: "other", scenarioName: "Current" }} />);
    expect(screen.getByText(/active/i)).toBeTruthy();
  });
});
