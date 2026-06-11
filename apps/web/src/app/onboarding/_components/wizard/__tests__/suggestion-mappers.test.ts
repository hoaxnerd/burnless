import { describe, it, expect } from "vitest";
import {
  toRevenueSuggestions,
  toFundingSuggestions,
  toExpenseSuggestions,
  toHeadcountSuggestions,
} from "../suggestion-mappers";
import type {
  RevenueStream,
  FundingRound,
  OperatingExpense,
  HeadcountRole,
} from "../../types";

describe("toRevenueSuggestions", () => {
  it("maps a subscription stream to RevenueStreamFormValues with type-valid params", () => {
    const input: RevenueStream[] = [
      {
        name: "Pro plan",
        type: "subscription",
        amount: 49,
        quantity: 100,
        startDate: "2026-01-01",
      },
    ];
    const out = toRevenueSuggestions(input);
    expect(out).toHaveLength(1);
    const r = out[0]!;
    expect(r.name).toBe("Pro plan");
    expect(r.type).toBe("subscription");
    expect(r.startDate).toBe("2026-01-01");
    expect(r.endDate).toBeNull();
    // Subscription seeds monthlyPrice from amount, startingCustomers from quantity.
    expect(r.parameters).toMatchObject({ monthlyPrice: 49, startingCustomers: 100 });
    // All canonical subscription keys present.
    expect(r.parameters).toHaveProperty("newCustomersPerMonth");
    expect(r.parameters).toHaveProperty("monthlyChurnRate");
  });

  it("maps non-subscription types to their type-appropriate amount field", () => {
    const out = toRevenueSuggestions([
      { name: "Consulting", type: "services", amount: 150, quantity: 80, startDate: "2026-02-01" },
    ]);
    const r = out[0]!;
    expect(r.type).toBe("services");
    expect(r.parameters).toMatchObject({ hourlyRate: 150, hoursPerMonth: 80 });
    expect(r.endDate).toBeNull();
  });
});

describe("toFundingSuggestions", () => {
  it("maps a seed round to FundingRoundSubmitPayload with roundType + default params", () => {
    const input: FundingRound[] = [
      {
        name: "Seed round",
        type: "seed",
        amount: 1_500_000,
        date: "2025-06-01",
        preMoneyValuation: 8_000_000,
        dilutionPercent: null,
        notes: "Led by Acme Ventures",
      },
    ];
    const out = toFundingSuggestions(input);
    expect(out).toHaveLength(1);
    const f = out[0]!;
    expect(f.name).toBe("Seed round");
    expect(f.roundType).toBe("seed");
    expect(f.amount).toBe(1_500_000);
    expect(f.date).toBe("2025-06-01");
    expect(f.closeDate).toBeNull();
    expect(f.notes).toBe("Led by Acme Ventures");
    expect(f.isProjected).toBe(false);
    // Equity default params for seed.
    expect(f.parameters).toHaveProperty("sharesIssued");
    expect(f.parameters).toHaveProperty("pricePerShare");
  });

  it("maps a grant round and defaults notes to null when absent", () => {
    const out = toFundingSuggestions([
      {
        name: "SBIR grant",
        type: "grant",
        amount: 250_000,
        date: "2025-03-15",
        preMoneyValuation: null,
        dilutionPercent: null,
      },
    ]);
    const f = out[0]!;
    expect(f.roundType).toBe("grant");
    expect(f.notes).toBeNull();
    // Grant default params include milestones array.
    expect(f.parameters).toHaveProperty("milestones");
  });
});

describe("toExpenseSuggestions", () => {
  const accounts = [
    { id: "acc-cloud", name: "Cloud Infrastructure", category: "operating_expense" },
    { id: "acc-mktg", name: "Marketing", category: "operating_expense" },
    { id: "acc-cogs", name: "COGS", category: "cogs" },
  ];

  it("resolves category name to accountId (case-insensitive) and uses fixed method", () => {
    const input: OperatingExpense[] = [
      {
        name: "AWS",
        category: "Cloud Infrastructure",
        amount: 3200,
        startDate: "2026-01-01",
        isRecurring: true,
      },
    ];
    const out = toExpenseSuggestions(input, accounts);
    expect(out).toHaveLength(1);
    const e = out[0]!;
    expect(e.accountId).toBe("acc-cloud");
    expect(e.method).toBe("fixed");
    expect(e.parameters).toEqual({ amount: 3200 });
    expect(e.isRecurring).toBe(true);
    expect(e.startDate).toBe("2026-01-01");
    expect(e.name).toBe("AWS");
  });

  it("falls back to the first operating_expense account when no name match", () => {
    const out = toExpenseSuggestions(
      [
        {
          name: "Misc",
          category: "Office & Admin",
          amount: 500,
          startDate: "2026-04-01",
          isRecurring: false,
        },
      ],
      accounts,
    );
    const e = out[0]!;
    // No "Office & Admin" account → fall back to first operating_expense.
    expect(e.accountId).toBe("acc-cloud");
    expect(e.parameters).toEqual({ amount: 500 });
    expect(e.isRecurring).toBe(false);
  });
});

describe("toHeadcountSuggestions", () => {
  const departments = [
    { id: "dep-eng", name: "Engineering" },
    { id: "dep-sales", name: "Sales" },
  ];

  it("resolves department name to id and maps role fields", () => {
    const input: HeadcountRole[] = [
      {
        title: "Senior Engineer",
        department: "Engineering",
        employeeType: "full_time",
        salary: 160_000,
        startDate: "2026-02-01",
      },
    ];
    const out = toHeadcountSuggestions(input, departments);
    expect(out).toHaveLength(1);
    const h = out[0]!;
    expect(h.departmentId).toBe("dep-eng");
    expect(h.title).toBe("Senior Engineer");
    expect(h.employeeType).toBe("full_time");
    expect(h.salary).toBe(160_000);
    expect(h.startDate).toBe("2026-02-01");
    expect(h.count).toBe(1);
    expect(h.hourlyRate).toBeNull();
    expect(h.hoursPerWeek).toBeNull();
    expect(h.benefitsRate).toBe(0.2);
    expect(h.endDate).toBeNull();
    expect(h.parameters).toBeNull();
  });

  it("falls back to the first department when no name match", () => {
    const out = toHeadcountSuggestions(
      [
        {
          title: "Ops Lead",
          department: "Operations",
          employeeType: "full_time",
          salary: 120_000,
          startDate: "2026-05-01",
        },
      ],
      departments,
    );
    expect(out[0]!.departmentId).toBe("dep-eng");
  });
});
