import type { FundingRoundType } from "@burnless/engine";

export function defaultParamsForType(type: FundingRoundType): Record<string, unknown> {
  switch (type) {
    case "safe":
      return { valuationCap: undefined, discountRate: undefined };
    case "convertible":
      return { valuationCap: undefined, discountRate: undefined, interestRate: 0.08, maturityDate: undefined };
    case "debt":
      return { interestRate: 0.08, termMonths: 36, repaymentSchedule: "straight_line" };
    case "grant":
      return { milestones: [] };
    default:
      return { sharesIssued: undefined, pricePerShare: undefined };
  }
}

export function normalizePayload(
  type: FundingRoundType,
  params: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
}

export function validateParams(
  type: FundingRoundType,
  params: Record<string, unknown>,
): string | null {
  if (type === "debt") {
    if (typeof params.interestRate !== "number" || typeof params.termMonths !== "number") {
      return "Debt rounds require interestRate and termMonths.";
    }
  }
  if (type === "grant") {
    const milestones = (params as any).milestones as unknown[] | undefined;
    if (!Array.isArray(milestones) || milestones.length === 0) {
      return "Grant rounds require at least one milestone.";
    }
  }
  return null;
}
