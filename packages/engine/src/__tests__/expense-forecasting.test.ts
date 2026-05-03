import { describe, it, expect } from "vitest";
import {
  computeForecastLine,
  computeAllForecastLines,
  aggregateByAccount,
  type ForecastLineInput,
} from "../forecasting";
import {
  computeAllHeadcountCosts,
  type HeadcountPlanInput,
} from "../headcount";
import { categorizeTransaction } from "../categorization";
import { monthKey, seriesToArray, addSeries } from "../utils";

describe("expense forecasting scenarios", () => {
  const start = new Date(2026, 0, 1); // Jan 2026
  const end = new Date(2026, 5, 1); // Jun 2026

  // ── 1. Multi-expense aggregation (realistic startup scenario) ─────────────

  describe("multi-expense aggregation", () => {
    const lines: ForecastLineInput[] = [
      {
        id: "rent",
        accountId: "acct-rent",
        method: "fixed",
        parameters: { amount: 5000 },
        startDate: start,
        endDate: null,
      },
      {
        id: "aws",
        accountId: "acct-aws",
        method: "growth_rate",
        parameters: { baseAmount: 2000, monthlyGrowthRate: 0.10 },
        startDate: start,
        endDate: null,
      },
      {
        id: "marketing",
        accountId: "acct-marketing",
        method: "fixed",
        parameters: { amount: 3000 },
        startDate: start,
        endDate: null,
      },
      {
        id: "contractor",
        accountId: "acct-contractor",
        method: "per_unit",
        parameters: { units: 3, pricePerUnit: 150 * 160 }, // 3 contractors × $150/hr × 160hrs
        startDate: start,
        endDate: null,
      },
      {
        id: "legal",
        accountId: "acct-legal",
        method: "fixed",
        parameters: { amount: 1000 },
        startDate: start,
        endDate: null,
      },
    ];

    it("aggregateByAccount sums correctly across all accounts", () => {
      const allValues = computeAllForecastLines(lines, start, end);
      const byAccount = aggregateByAccount(lines, allValues);

      // Each account should have its own entry
      expect(byAccount.size).toBe(5);
      expect(byAccount.has("acct-rent")).toBe(true);
      expect(byAccount.has("acct-aws")).toBe(true);
      expect(byAccount.has("acct-marketing")).toBe(true);
      expect(byAccount.has("acct-contractor")).toBe(true);
      expect(byAccount.has("acct-legal")).toBe(true);
    });

    it("total monthly expense for Jan 2026 equals sum of all lines", () => {
      const allValues = computeAllForecastLines(lines, start, end);
      const jan = "2026-01";

      const rentJan = allValues.get("rent")!.get(jan)!;
      const awsJan = allValues.get("aws")!.get(jan)!;
      const marketingJan = allValues.get("marketing")!.get(jan)!;
      const contractorJan = allValues.get("contractor")!.get(jan)!;
      const legalJan = allValues.get("legal")!.get(jan)!;

      expect(rentJan).toBe(5000);
      expect(awsJan).toBe(2000);
      expect(marketingJan).toBe(3000);
      // 3 contractors × $150/hr × 160hrs = $72,000
      expect(contractorJan).toBe(72000);
      expect(legalJan).toBe(1000);

      const totalJan = rentJan + awsJan + marketingJan + contractorJan + legalJan;
      expect(totalJan).toBe(83000);
    });

    it("AWS grows over 6 months while rent stays constant", () => {
      const allValues = computeAllForecastLines(lines, start, end);
      const rentSeries = seriesToArray(allValues.get("rent")!);
      const awsSeries = seriesToArray(allValues.get("aws")!);

      // Rent stays constant
      for (const entry of rentSeries) {
        expect(entry.value).toBe(5000);
      }

      // AWS grows each month: 2000 * 1.10^n
      expect(awsSeries[0]!.value).toBeCloseTo(2000, 2);
      expect(awsSeries[1]!.value).toBeCloseTo(2200, 2);
      expect(awsSeries[2]!.value).toBeCloseTo(2420, 2);
      expect(awsSeries[3]!.value).toBeCloseTo(2662, 2);
      expect(awsSeries[4]!.value).toBeCloseTo(2928.20, 2);
      expect(awsSeries[5]!.value).toBeCloseTo(3221.02, 2);

      // AWS June should be greater than AWS January
      expect(awsSeries[5]!.value).toBeGreaterThan(awsSeries[0]!.value);
    });
  });

  // ── 2. COGS vs OpEx separation ────────────────────────────────────────────

  describe("COGS vs OpEx separation", () => {
    const cogsLines: ForecastLineInput[] = [
      {
        id: "hosting",
        accountId: "cogs-hosting",
        method: "fixed",
        parameters: { amount: 4000 },
        startDate: start,
        endDate: null,
      },
      {
        id: "payment-processing",
        accountId: "cogs-payment-processing",
        method: "fixed",
        parameters: { amount: 1500 },
        startDate: start,
        endDate: null,
      },
    ];

    const opexLines: ForecastLineInput[] = [
      {
        id: "office-rent",
        accountId: "opex-rent",
        method: "fixed",
        parameters: { amount: 5000 },
        startDate: start,
        endDate: null,
      },
      {
        id: "marketing-spend",
        accountId: "opex-marketing",
        method: "fixed",
        parameters: { amount: 3000 },
        startDate: start,
        endDate: null,
      },
    ];

    it("aggregateByAccount keeps COGS and OpEx accounts separate", () => {
      const allLines = [...cogsLines, ...opexLines];
      const allValues = computeAllForecastLines(allLines, start, end);
      const byAccount = aggregateByAccount(allLines, allValues);

      // Verify COGS accounts
      const hostingValues = byAccount.get("cogs-hosting")!;
      const paymentValues = byAccount.get("cogs-payment-processing")!;
      expect(hostingValues.get("2026-01")).toBe(4000);
      expect(paymentValues.get("2026-01")).toBe(1500);

      // Verify OpEx accounts
      const rentValues = byAccount.get("opex-rent")!;
      const marketingValues = byAccount.get("opex-marketing")!;
      expect(rentValues.get("2026-01")).toBe(5000);
      expect(marketingValues.get("2026-01")).toBe(3000);

      // They should be 4 distinct accounts, not merged
      expect(byAccount.size).toBe(4);

      // COGS total should differ from OpEx total
      const cogsTotal = hostingValues.get("2026-01")! + paymentValues.get("2026-01")!;
      const opexTotal = rentValues.get("2026-01")! + marketingValues.get("2026-01")!;
      expect(cogsTotal).toBe(5500);
      expect(opexTotal).toBe(8000);
    });
  });

  // ── 3. Headcount as expense integration ───────────────────────────────────

  describe("headcount as expense integration", () => {
    const plans: HeadcountPlanInput[] = [
      {
        id: "engineers",
        departmentId: "dept-engineering",
        title: "Software Engineer",
        employeeType: "full_time",
        count: 5,
        salary: 150000,
        hourlyRate: null,
        hoursPerWeek: null,
        startDate: start,
        endDate: null,
        benefitsRate: 0.20,
      },
      {
        id: "designers",
        departmentId: "dept-design",
        title: "Product Designer",
        employeeType: "full_time",
        count: 2,
        salary: 120000,
        hourlyRate: null,
        hoursPerWeek: null,
        startDate: start,
        endDate: null,
        benefitsRate: 0.20,
      },
    ];

    it("total cost equals salary plus benefits", () => {
      const result = computeAllHeadcountCosts(plans, start, end);
      const jan = "2026-01";

      const totalCostJan = result.totalCost.get(jan)!;
      const salaryCostJan = result.salaryCost.get(jan)!;
      const benefitsCostJan = result.benefitsCost.get(jan)!;

      expect(totalCostJan).toBeCloseTo(salaryCostJan + benefitsCostJan, 2);
    });

    it("monthly cost for engineers: (150000 * 5 * 1.2) / 12", () => {
      const result = computeAllHeadcountCosts(plans, start, end);
      const jan = "2026-01";

      // Engineers: 150000 * 5 / 12 = 62,500 salary/mo
      // Benefits: 62,500 * 0.20 = 12,500 benefits/mo
      // Total: 75,000/mo
      const expectedEngineerSalary = (150000 * 5) / 12;
      const expectedEngineerBenefits = expectedEngineerSalary * 0.20;
      const expectedEngineerTotal = expectedEngineerSalary + expectedEngineerBenefits;

      const engineeringDept = result.byDepartment.get("dept-engineering")!;
      expect(engineeringDept.get(jan)).toBeCloseTo(expectedEngineerTotal, 2);
      expect(expectedEngineerTotal).toBeCloseTo(75000, 2);
    });

    it("computes costs for all 6 months", () => {
      const result = computeAllHeadcountCosts(plans, start, end);

      // Engineers: 75,000/mo + Designers: (120000*2*1.2)/12 = 24,000/mo
      // Total: 99,000/mo
      const expectedMonthly = (150000 * 5 * 1.2) / 12 + (120000 * 2 * 1.2) / 12;

      for (let m = 0; m < 6; m++) {
        const key = monthKey(new Date(2026, m, 1));
        expect(result.totalCost.get(key)).toBeCloseTo(expectedMonthly, 2);
      }
    });
  });

  // ── 4. Expense with growth modeling (SaaS scaling) ────────────────────────

  describe("expense with growth modeling", () => {
    it("AWS at 10%/mo growth matches hand-calculated values", () => {
      const awsLine: ForecastLineInput = {
        id: "aws-growth",
        accountId: "acct-aws",
        method: "growth_rate",
        parameters: { baseAmount: 2000, monthlyGrowthRate: 0.10 },
        startDate: start,
        endDate: null,
      };

      const result = computeForecastLine(awsLine, start, end);
      const values = seriesToArray(result);

      // Hand-calculated: 2000 * 1.10^n for n = 0..5
      const expected = [
        2000.00,
        2200.00,
        2420.00,
        2662.00,
        2928.20,
        3221.02,
      ];

      for (let i = 0; i < expected.length; i++) {
        expect(values[i]!.value).toBeCloseTo(expected[i]!, 2);
      }
    });
  });

  // ── 5. Percentage-of expense (commission on revenue) ──────────────────────

  describe("percentage-of expense", () => {
    const lines: ForecastLineInput[] = [
      {
        id: "revenue",
        accountId: "acct-revenue",
        method: "fixed",
        parameters: { amount: 100000 },
        startDate: start,
        endDate: null,
      },
      {
        id: "sales-commission",
        accountId: "acct-commission",
        method: "percentage_of",
        parameters: { sourceLineId: "revenue", percentage: 0.10 },
        startDate: start,
        endDate: null,
      },
      {
        id: "payment-processing-fee",
        accountId: "acct-processing",
        method: "percentage_of",
        parameters: { sourceLineId: "revenue", percentage: 0.029 },
        startDate: start,
        endDate: null,
      },
    ];

    it("commission equals 10% of revenue each month", () => {
      const allValues = computeAllForecastLines(lines, start, end);

      for (let m = 0; m < 6; m++) {
        const key = monthKey(new Date(2026, m, 1));
        expect(allValues.get("sales-commission")!.get(key)).toBeCloseTo(10000, 2);
      }
    });

    it("payment processing fee equals 2.9% of revenue each month", () => {
      const allValues = computeAllForecastLines(lines, start, end);

      for (let m = 0; m < 6; m++) {
        const key = monthKey(new Date(2026, m, 1));
        expect(allValues.get("payment-processing-fee")!.get(key)).toBeCloseTo(2900, 2);
      }
    });
  });

  // ── 6. Expense start/end dates (contractor engagement) ────────────────────

  describe("expense start/end dates", () => {
    it("contractor active only Mar-May 2026", () => {
      const contractorLine: ForecastLineInput = {
        id: "contractor-engagement",
        accountId: "acct-contractor",
        method: "fixed",
        parameters: { amount: 15000 },
        startDate: new Date(2026, 2, 1), // Mar 1
        endDate: new Date(2026, 4, 31), // May 31
      };

      const result = computeForecastLine(contractorLine, start, end);

      expect(result.get("2026-01")).toBe(0); // before start
      expect(result.get("2026-02")).toBe(0); // before start
      expect(result.get("2026-03")).toBe(15000); // active
      expect(result.get("2026-04")).toBe(15000); // active
      expect(result.get("2026-05")).toBe(15000); // active
      expect(result.get("2026-06")).toBe(0); // after end
    });
  });

  // ── 7. Multiple lines per account (budget consolidation) ──────────────────

  describe("multiple lines per account", () => {
    it("two marketing lines on same account aggregate to combined total", () => {
      const marketingLines: ForecastLineInput[] = [
        {
          id: "google-ads",
          accountId: "acct-marketing",
          method: "fixed",
          parameters: { amount: 2000 },
          startDate: start,
          endDate: null,
        },
        {
          id: "meta-ads",
          accountId: "acct-marketing",
          method: "fixed",
          parameters: { amount: 1500 },
          startDate: start,
          endDate: null,
        },
      ];

      const allValues = computeAllForecastLines(marketingLines, start, end);
      const byAccount = aggregateByAccount(marketingLines, allValues);

      // Should produce a single account entry
      expect(byAccount.size).toBe(1);

      // Combined total should be $3500/mo
      for (let m = 0; m < 6; m++) {
        const key = monthKey(new Date(2026, m, 1));
        expect(byAccount.get("acct-marketing")!.get(key)).toBeCloseTo(3500, 2);
      }
    });
  });

  // ── 8. Zero-value edge case ───────────────────────────────────────────────

  describe("zero-value edge case", () => {
    it("forecast line with $0 fixed amount produces all zeros without error", () => {
      const zeroLine: ForecastLineInput = {
        id: "zero-expense",
        accountId: "acct-zero",
        method: "fixed",
        parameters: { amount: 0 },
        startDate: start,
        endDate: null,
      };

      const result = computeForecastLine(zeroLine, start, end);

      expect(result.size).toBe(6);
      for (const [, val] of result) {
        expect(val).toBe(0);
      }

      // Should not break aggregation either
      const allValues = computeAllForecastLines([zeroLine], start, end);
      const byAccount = aggregateByAccount([zeroLine], allValues);
      expect(byAccount.get("acct-zero")!.get("2026-01")).toBe(0);
    });

    it("zero-value line does not affect other lines when aggregated", () => {
      const lines: ForecastLineInput[] = [
        {
          id: "real-expense",
          accountId: "acct-shared",
          method: "fixed",
          parameters: { amount: 5000 },
          startDate: start,
          endDate: null,
        },
        {
          id: "zero-expense",
          accountId: "acct-shared",
          method: "fixed",
          parameters: { amount: 0 },
          startDate: start,
          endDate: null,
        },
      ];

      const allValues = computeAllForecastLines(lines, start, end);
      const byAccount = aggregateByAccount(lines, allValues);

      for (let m = 0; m < 6; m++) {
        const key = monthKey(new Date(2026, m, 1));
        expect(byAccount.get("acct-shared")!.get(key)).toBe(5000);
      }
    });
  });

  // ── 9. Headcount mid-year hiring ──────────────────────────────────────────

  describe("headcount mid-year hiring", () => {
    it("engineer hired in April shows $0 for Jan-Mar and full cost from April", () => {
      const plans: HeadcountPlanInput[] = [
        {
          id: "april-hire",
          departmentId: "dept-engineering",
          title: "Senior Engineer",
          employeeType: "full_time",
          count: 1,
          salary: 180000,
          hourlyRate: null,
          hoursPerWeek: null,
          startDate: new Date(2026, 3, 1), // April 1
          endDate: null,
          benefitsRate: 0.20,
        },
      ];

      const result = computeAllHeadcountCosts(plans, start, end);

      // Jan, Feb, Mar should be $0
      expect(result.totalCost.get("2026-01")).toBe(0);
      expect(result.totalCost.get("2026-02")).toBe(0);
      expect(result.totalCost.get("2026-03")).toBe(0);

      // April onwards: (180000 / 12) * 1.20 = 18,000/mo
      const expectedMonthlyCost = (180000 / 12) * 1.20;
      expect(result.totalCost.get("2026-04")).toBeCloseTo(expectedMonthlyCost, 2);
      expect(result.totalCost.get("2026-05")).toBeCloseTo(expectedMonthlyCost, 2);
      expect(result.totalCost.get("2026-06")).toBeCloseTo(expectedMonthlyCost, 2);
      expect(expectedMonthlyCost).toBeCloseTo(18000, 2);
    });

    it("headcount count is 0 before start date and 1 from April", () => {
      const plans: HeadcountPlanInput[] = [
        {
          id: "april-hire",
          departmentId: "dept-engineering",
          title: "Senior Engineer",
          employeeType: "full_time",
          count: 1,
          salary: 180000,
          hourlyRate: null,
          hoursPerWeek: null,
          startDate: new Date(2026, 3, 1),
          endDate: null,
          benefitsRate: 0.20,
        },
      ];

      const result = computeAllHeadcountCosts(plans, start, end);

      expect(result.headcount.get("2026-01")).toBe(0);
      expect(result.headcount.get("2026-02")).toBe(0);
      expect(result.headcount.get("2026-03")).toBe(0);
      expect(result.headcount.get("2026-04")).toBe(1);
      expect(result.headcount.get("2026-05")).toBe(1);
      expect(result.headcount.get("2026-06")).toBe(1);
    });
  });
});
