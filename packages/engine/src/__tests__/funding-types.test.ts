import { describe, it, expectTypeOf } from "vitest";
import type {
  FundingRoundInput,
  SafeParams,
  ConvertibleParams,
  DebtParams,
  GrantParams,
  EquityParams,
  FundingImpact,
  CapTable,
  GrantMatchWarning,
} from "../funding";

describe("funding.ts types", () => {
  it("FundingRoundInput discriminates by roundType", () => {
    expectTypeOf<FundingRoundInput["roundType"]>().toEqualTypeOf<
      | "pre_seed" | "seed" | "series_a" | "series_b" | "series_c_plus"
      | "safe" | "convertible" | "debt" | "grant"
    >();
  });

  it("FundingImpact exposes cashFlows + capTableDeltas + warnings", () => {
    expectTypeOf<FundingImpact>().toMatchTypeOf<{
      equityInflows: import("../utils").MonthlySeries;
      debtInflows: import("../utils").MonthlySeries;
      interestExpense: import("../utils").MonthlySeries;
      principalPayments: import("../utils").MonthlySeries;
      grantDisbursements: import("../utils").MonthlySeries;
      warnings: GrantMatchWarning[];
    }>();
  });
});
