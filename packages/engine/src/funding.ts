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
// computeGrant (Task 11)
// computeCapTable (Task 13)
// computeFundingImpact (Task 14)

// --- Task 10: Debt schedule ---

export interface DebtComputeInput {
  principal: number;
  debtParams: DebtParams;
  issueDate: string;
  months: string[]; // ordered "YYYY-MM"
}

export interface DebtComputeResult {
  draws: MonthlySeries; // principal disbursement (financing CF inflow)
  interestExpense: MonthlySeries; // monthly interest (operating P&L)
  principalPayments: MonthlySeries; // monthly principal (financing CF outflow)
}

/**
 * Compute monthly debt schedule. Pure function — no I/O. Idempotent.
 *
 * Schedule kinds:
 *   - straight_line: principal evenly split across termMonths; interest on declining balance.
 *   - interest_only: interest only until final month, full principal balloon at term end.
 *   - amortized: equal monthly P+I payment (mortgage-style). Implemented in Task 10.5 if needed.
 */
export function computeDebt(input: DebtComputeInput): DebtComputeResult {
  const { principal, debtParams, issueDate, months } = input;
  const issueKey = issueDate.slice(0, 7);
  const firstPay = (debtParams.firstPaymentDate ?? issueDate).slice(0, 7);
  const monthlyRate = D(debtParams.interestRate).div(12);
  const schedule = debtParams.repaymentSchedule ?? "straight_line";

  const draws: MonthlySeries = new Map();
  const interestExpense: MonthlySeries = new Map();
  const principalPayments: MonthlySeries = new Map();
  for (const m of months) {
    draws.set(m, 0);
    interestExpense.set(m, 0);
    principalPayments.set(m, 0);
  }
  if (months.includes(issueKey)) draws.set(issueKey, principal);

  let balance = D(principal);
  let monthsPaid = 0;
  for (const m of months) {
    if (m < firstPay) continue;
    if (monthsPaid >= debtParams.termMonths) break;

    const interest = dRound2(balance.mul(monthlyRate));
    interestExpense.set(m, Number(interest));

    let principalThisMonth = D(0);
    if (schedule === "straight_line") {
      principalThisMonth = D(principal).div(debtParams.termMonths);
    } else if (schedule === "interest_only") {
      if (monthsPaid === debtParams.termMonths - 1) {
        principalThisMonth = balance;
      }
    }
    const roundedPrincipal = dRound2(principalThisMonth);
    principalPayments.set(m, Number(roundedPrincipal));
    balance = balance.minus(roundedPrincipal);
    monthsPaid += 1;
  }
  return { draws, interestExpense, principalPayments };
}

// --- Task 8: SAFE conversion math ---

export interface SafeConversionInput {
  safeAmount: number;
  safeParams: SafeParams;
  qualifiedRoundPreMoney: number;
  qualifiedRoundPricePerShare: number;
  preRoundFullyDilutedShares: number;
}

export interface SafeConversionResult {
  method: "cap" | "discount" | "priced";
  effectivePricePerShare: number;
  sharesIssued: number;
}

/**
 * SAFE conversion at a qualified financing event.
 *
 * Conversion price is the LOWER of:
 *   - cap path: valuationCap / preRoundFullyDilutedShares
 *   - discount path: pricePerShare * (1 - discountRate)
 *   - priced path: pricePerShare (fallback when neither cap nor discount apply)
 *
 * Lower price = more shares for the SAFE holder. We always take the holder-favorable
 * outcome (industry standard YC SAFE clause).
 */
export function computeSafeConversion(
  input: SafeConversionInput,
): SafeConversionResult {
  const { safeAmount, safeParams, qualifiedRoundPricePerShare, preRoundFullyDilutedShares } = input;
  const priced = D(qualifiedRoundPricePerShare);
  const candidates: Array<{ method: SafeConversionResult["method"]; price: Decimal }> = [
    { method: "priced", price: priced },
  ];
  if (safeParams.valuationCap && safeParams.valuationCap > 0) {
    const capPrice = D(safeParams.valuationCap).div(preRoundFullyDilutedShares);
    candidates.push({ method: "cap", price: capPrice });
  }
  if (safeParams.discountRate && safeParams.discountRate > 0) {
    const discountPrice = priced.mul(D(1).minus(safeParams.discountRate));
    candidates.push({ method: "discount", price: discountPrice });
  }
  // Pick the lowest price (most shares for holder). On a tie, later candidates (cap, discount) win
  // over "priced" — cap / discount terms are more specific and holder-favourable by convention.
  const winner = candidates.reduce((a, b) => (b.price.lte(a.price) ? b : a));
  const effectivePricePerShare = Number(winner.price.toFixed(6));
  const sharesIssued = Math.floor(Number(D(safeAmount).div(winner.price).toFixed(0)));
  return { method: winner.method, effectivePricePerShare, sharesIssued };
}

// --- Task 9: Convertible note conversion math ---

export interface ConvertibleNoteConversionInput {
  noteAmount: number;
  noteParams: ConvertibleParams;
  issueDate: string;
  conversionDate: string;
  qualifiedRoundPreMoney: number;
  qualifiedRoundPricePerShare: number;
  preRoundFullyDilutedShares: number;
}

export interface ConvertibleNoteConversionResult extends SafeConversionResult {
  accruedInterest: number;
  principalPlusInterest: number;
}

export function computeConvertibleNote(
  input: ConvertibleNoteConversionInput,
): ConvertibleNoteConversionResult {
  const issue = new Date(input.issueDate);
  const convert = new Date(input.conversionDate);
  // Month-based accrual: avoids leap-year / day-count drift; matches standard simple-interest convention.
  const monthsElapsed =
    (convert.getFullYear() - issue.getFullYear()) * 12 +
    (convert.getMonth() - issue.getMonth());
  const yearsElapsed = monthsElapsed / 12;
  const accrued = D(input.noteAmount).mul(input.noteParams.interestRate ?? 0).mul(yearsElapsed);
  const total = D(input.noteAmount).plus(accrued);
  const safeResult = computeSafeConversion({
    safeAmount: Number(total.toFixed(2)),
    safeParams: {
      valuationCap: input.noteParams.valuationCap,
      discountRate: input.noteParams.discountRate,
    },
    qualifiedRoundPreMoney: input.qualifiedRoundPreMoney,
    qualifiedRoundPricePerShare: input.qualifiedRoundPricePerShare,
    preRoundFullyDilutedShares: input.preRoundFullyDilutedShares,
  });
  return {
    ...safeResult,
    accruedInterest: Number(accrued.toFixed(2)),
    principalPlusInterest: Number(total.toFixed(2)),
  };
}
