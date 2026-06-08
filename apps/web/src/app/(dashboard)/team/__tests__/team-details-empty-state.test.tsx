import { vi, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

// SHELL-05 / TEAM-10: both empty-state CTAs must read the canonical "Add hire"
// label (headcount-form.tsx ADD_HIRE_LABEL), not "Add Team Member" / "Add Hire".

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/api-fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/components/locale/locale-context", () => ({
  useLocale: () => ({ fmtPercent: (n: number) => `${n}%`, fmtCurrency: (n: number) => `$${n}` }),
}));
vi.mock("@/components/scenarios/use-scenario-overrides", () => ({
  useScenarioOverrides: () => ({
    isInScenarioMode: false,
    overrideMap: new Map(),
    deletedEntities: [],
    handleRevert: vi.fn(),
    handleRemove: vi.fn(),
    handleRestore: vi.fn(),
  }),
}));
vi.mock("./headcount-form", async () => {
  const actual = await vi.importActual<typeof import("../headcount-form")>("../headcount-form");
  return { ...actual, HeadcountForm: () => null };
});

import { TeamRoster, PlannedHiresSection } from "../team-details";
import { ADD_HIRE_LABEL } from "../headcount-form";

describe("team empty-state copy (SHELL-05 / TEAM-10)", () => {
  it("roster empty state references the canonical Add hire label", () => {
    render(
      <TeamRoster
        departmentBreakdown={[]}
        totalMonthlyCost={0}
        departments={[]}
        companyBenefitsRates={{}}
        currency="USD"
      />,
    );
    expect(ADD_HIRE_LABEL).toBe("Add hire");
    expect(screen.getByText(/Add hire/)).toBeTruthy();
    expect(screen.queryByText(/Add Team Member/)).toBeNull();
  });

  it("planned-hires empty state references the canonical Add hire label", () => {
    render(
      <PlannedHiresSection
        plannedHires={[]}
        departments={[]}
        companyBenefitsRates={{}}
        currency="USD"
      />,
    );
    expect(screen.getByText(/Add hire/)).toBeTruthy();
    // "Add Hire" (title-case) must no longer appear
    expect(screen.queryByText(/Add Hire button/)).toBeNull();
  });
});
