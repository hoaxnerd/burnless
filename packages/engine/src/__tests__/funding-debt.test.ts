import { describe, it, expect } from "vitest";
import { computeDebt } from "../funding";
import { monthRange } from "../utils";

describe("computeDebt", () => {
  const months = monthRange("2026-01-01", "2026-12-31").map(
    (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
  );

  it("straight-line: monthly principal = amount/term; interest declines as balance shrinks", () => {
    const result = computeDebt({
      principal: 120_000,
      debtParams: { interestRate: 0.12, termMonths: 12, repaymentSchedule: "straight_line" },
      issueDate: "2026-01-01",
      months,
    });
    expect(result.principalPayments.get("2026-01")).toBe(10_000);
    expect(result.interestExpense.get("2026-01")).toBe(1_200);
    expect(result.interestExpense.get("2026-12")).toBe(100);
    expect(result.draws.get("2026-01")).toBe(120_000);
    expect(result.draws.get("2026-02") ?? 0).toBe(0);
  });

  it("straight-line residual: 100k/12 → months 1–11 = 8333.33, month 12 = 8333.37, Σ = 100000", () => {
    const result = computeDebt({
      principal: 100_000,
      debtParams: { interestRate: 0.12, termMonths: 12, repaymentSchedule: "straight_line" },
      issueDate: "2026-01-01",
      months,
    });
    for (let i = 0; i < 11; i++) {
      expect(result.principalPayments.get(months[i])).toBe(8333.33);
    }
    expect(result.principalPayments.get("2026-12")).toBe(8333.37);
    const sum = months.reduce((acc, m) => acc + (result.principalPayments.get(m) ?? 0), 0);
    expect(Math.round(sum * 100) / 100).toBe(100_000);
  });

  it("termMonths=0: only the draw, no principal/interest, no divide-by-zero", () => {
    const result = computeDebt({
      principal: 100_000,
      debtParams: { interestRate: 0.12, termMonths: 0, repaymentSchedule: "straight_line" },
      issueDate: "2026-01-01",
      months,
    });
    expect(result.draws.get("2026-01")).toBe(100_000);
    for (const m of months) {
      expect(result.principalPayments.get(m) ?? 0).toBe(0);
      expect(result.interestExpense.get(m) ?? 0).toBe(0);
    }
  });

  it("interest_only: zero principal until final month (balloon)", () => {
    const result = computeDebt({
      principal: 120_000,
      debtParams: { interestRate: 0.12, termMonths: 12, repaymentSchedule: "interest_only" },
      issueDate: "2026-01-01",
      months,
    });
    for (let i = 0; i < 11; i++) {
      expect(result.principalPayments.get(months[i]) ?? 0).toBe(0);
      expect(result.interestExpense.get(months[i])).toBe(1_200);
    }
    expect(result.principalPayments.get("2026-12")).toBe(120_000);
  });

  it("no payments before first scheduled payment date", () => {
    const result = computeDebt({
      principal: 60_000,
      debtParams: { interestRate: 0.12, termMonths: 6, repaymentSchedule: "straight_line", firstPaymentDate: "2026-04-01" },
      issueDate: "2026-01-01",
      months,
    });
    expect(result.draws.get("2026-01")).toBe(60_000);
    expect(result.principalPayments.get("2026-01") ?? 0).toBe(0);
    expect(result.principalPayments.get("2026-04")).toBe(10_000);
  });
});
