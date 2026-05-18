/**
 * Funding engine module — Phase 2 D §1.3.
 *
 * Pure functions. Scenario-blind: consumes already-resolved data. Currency-agnostic
 * (passes packages/engine/src/__tests__/no-currency-in-engine.test.ts).
 *
 * Owns: SAFE/convertible conversion math, debt interest accrual + amortization,
 * grant milestone disbursement + match warnings, cap-table composition.
 *
 * Integration point: statements.ts:generateCashFlow (Task 15).
 */
import Decimal from "decimal.js";
import { D, dAdd, dMul, dRound2 } from "./decimal";
import type { MonthlySeries } from "./utils";

// --- Discriminated round-type parameter shapes (mirrors Phase 2 D §1.1 D3) ---

export interface EquityParams {
  shareClassId?: string;
  sharesIssued?: number;
  pricePerShare?: number;
  liquidationPreference?: number;
}

export interface SafeParams {
  valuationCap?: number;
  discountRate?: number; // 0-1
  mfn?: boolean;
  proRata?: boolean;
}

export interface ConvertibleParams {
  valuationCap?: number;
  discountRate?: number;
  interestRate?: number; // 0-1, annualized
  maturityDate?: string; // YYYY-MM-DD
  conversionThreshold?: number;
}

export interface DebtParams {
  interestRate: number; // 0-1, annualized — required
  termMonths: number; // required
  repaymentSchedule?: "straight_line" | "amortized" | "interest_only";
  firstPaymentDate?: string;
}

export interface GrantMilestone {
  id: string;
  label: string;
  amount: number;
  dueDate: string;
  hitDate?: string;
}

export interface GrantMatchRequirement {
  requiredAmount: number;
  asOf: string; // YYYY-MM-DD — date the match must be met by
}

export interface GrantParams {
  milestones: GrantMilestone[];
  matchRequirement?: GrantMatchRequirement;
}

export type FundingRoundType =
  | "pre_seed" | "seed" | "series_a" | "series_b" | "series_c_plus"
  | "safe" | "convertible" | "debt" | "grant";

export interface FundingRoundInput {
  id: string;
  name: string;
  roundType: FundingRoundType;
  amount: number;
  date: string; // YYYY-MM-DD (signing/effective date)
  closeDate?: string | null; // cash hits this month
  parameters:
    | EquityParams | SafeParams | ConvertibleParams
    | DebtParams | GrantParams;
}

// --- Cap table types ---

export interface ShareClassInput {
  id: string;
  name: string;
  totalAuthorized: number;
  totalIssued: number;
  liquidationPreference: number;
}

export interface OptionPoolInput {
  id: string;
  name: string;
  totalReserved: number;
  totalGranted: number; // from equity_grants
}

export interface CapTableRow {
  holder: string;
  shareClass: string;
  shares: number;
  ownershipPercent: number; // 0-1, fully-diluted basis
}

export interface CapTable {
  rows: CapTableRow[];
  totalFullyDiluted: number;
  totals: {
    commonStock: number; // shares
    preferredStock: number;
    safeOverhang: number;
    optionPoolOverhang: number;
  };
}

// --- Output types ---

export interface GrantMatchWarning {
  roundId: string;
  roundName: string;
  milestoneId: string;
  milestoneLabel: string;
  requiredAmount: number;
  actualAmount: number;
  asOf: string;
}

export interface FundingImpact {
  equityInflows: MonthlySeries; // priced rounds + SAFE/convertible draws
  debtInflows: MonthlySeries; // debt principal disbursements
  interestExpense: MonthlySeries; // monthly debt interest (P&L line)
  principalPayments: MonthlySeries; // monthly debt principal (financing CF)
  grantDisbursements: MonthlySeries; // milestone-driven grant cash
  warnings: GrantMatchWarning[];
}

// --- Exports added in subsequent tasks ---
// computeSafeConversion (Task 8)
// computeConvertibleNote (Task 9)
// computeDebt (Task 10)
// computeGrant (Task 11)
// computeCapTable (Task 13)
// computeFundingImpact (Task 14)
