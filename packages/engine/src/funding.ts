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

// --- Task 12: Cap table composition ---

export interface CapTableInput {
  foundersOwnershipPercent: number;
  foundersTotalShares: number;
  shareClasses: ShareClassInput[];
  optionPools: OptionPoolInput[];
  pendingSafes: Array<{ id: string; amount: number; valuationCap?: number; discountRate?: number }>;
  pendingConvertibles: Array<{
    id: string;
    amount: number;
    valuationCap?: number;
    discountRate?: number;
    interestRate?: number;
    issueDate?: string;
  }>;
}

export function computeCapTable(input: CapTableInput): CapTable {
  const rows: CapTableRow[] = [];

  const commonStock = input.shareClasses
    .filter((s) => /common/i.test(s.name))
    .reduce((sum, s) => sum + s.totalIssued, 0);
  const preferredStock = input.shareClasses
    .filter((s) => !/common/i.test(s.name))
    .reduce((sum, s) => sum + s.totalIssued, 0);
  // Fully-diluted option pool = entire reserved pool (not just ungranted portion).
  // Granted shares are already counted in commonStock; the pool overhang = total reserved.
  const optionPoolOverhang = input.optionPools.reduce(
    (sum, p) => sum + p.totalReserved,
    0,
  );
  const preMoneyFD = commonStock + preferredStock + optionPoolOverhang;
  const safeOverhang = input.pendingSafes.reduce((sum, s) => {
    if (!s.valuationCap || preMoneyFD === 0) return sum;
    const capPrice = D(s.valuationCap).div(preMoneyFD);
    const shares = Math.floor(Number(D(s.amount).div(capPrice).toFixed(0)));
    return sum + shares;
  }, 0);
  const convertibleOverhang = input.pendingConvertibles.reduce((sum, c) => {
    if (!c.valuationCap || preMoneyFD === 0) return sum;
    const capPrice = D(c.valuationCap).div(preMoneyFD);
    const shares = Math.floor(Number(D(c.amount).div(capPrice).toFixed(0)));
    return sum + shares;
  }, 0);

  const totalFullyDiluted =
    commonStock + preferredStock + optionPoolOverhang + safeOverhang + convertibleOverhang;

  if (commonStock > 0) {
    rows.push({
      holder: "Founders",
      shareClass: "Common",
      shares: input.foundersTotalShares,
      ownershipPercent: totalFullyDiluted > 0 ? input.foundersTotalShares / totalFullyDiluted : 0,
    });
  }
  for (const s of input.shareClasses) {
    if (/common/i.test(s.name)) continue;
    rows.push({
      holder: s.name,
      shareClass: s.name,
      shares: s.totalIssued,
      ownershipPercent: totalFullyDiluted > 0 ? s.totalIssued / totalFullyDiluted : 0,
    });
  }
  for (const p of input.optionPools) {
    rows.push({
      holder: p.name,
      shareClass: "Option Pool",
      shares: p.totalReserved,
      ownershipPercent: totalFullyDiluted > 0 ? p.totalReserved / totalFullyDiluted : 0,
    });
  }

  return {
    rows,
    totalFullyDiluted,
    totals: {
      commonStock,
      preferredStock,
      safeOverhang: safeOverhang + convertibleOverhang,
      optionPoolOverhang,
    },
  };
}

// --- Task 13: FundingImpact orchestrator ---

export interface FundingImpactInput {
  rounds: FundingRoundInput[];
  months: string[];
  /** Cumulative qualifying spend by month (for grant match checks). Empty for no grants. */
  cumulativeQualifyingSpend: Record<string, number>;
}

export function computeFundingImpact(input: FundingImpactInput): FundingImpact {
  const initSeries = (): MonthlySeries => {
    const m = new Map<string, number>();
    for (const k of input.months) m.set(k, 0);
    return m;
  };
  const equityInflows = initSeries();
  const debtInflows = initSeries();
  const interestExpense = initSeries();
  const principalPayments = initSeries();
  const grantDisbursements = initSeries();
  const warnings: GrantMatchWarning[] = [];

  const addToSeries = (series: MonthlySeries, key: string, val: number) => {
    if (!series.has(key)) return; // outside horizon — drop silently
    series.set(key, (series.get(key) ?? 0) + val);
  };

  for (const round of input.rounds) {
    const cashMonth = (round.closeDate ?? round.date).slice(0, 7);
    switch (round.roundType) {
      case "pre_seed":
      case "seed":
      case "series_a":
      case "series_b":
      case "series_c_plus":
      case "safe":
      case "convertible": {
        addToSeries(equityInflows, cashMonth, round.amount);
        break;
      }
      case "debt": {
        const debt = computeDebt({
          principal: round.amount,
          debtParams: round.parameters as DebtParams,
          issueDate: round.date,
          months: input.months,
        });
        for (const m of input.months) {
          addToSeries(debtInflows, m, debt.draws.get(m) ?? 0);
          addToSeries(interestExpense, m, debt.interestExpense.get(m) ?? 0);
          addToSeries(principalPayments, m, debt.principalPayments.get(m) ?? 0);
        }
        break;
      }
      case "grant": {
        const grant = computeGrant({
          roundId: round.id,
          roundName: round.name,
          params: round.parameters as GrantParams,
          cumulativeQualifyingSpend: input.cumulativeQualifyingSpend,
        });
        for (const m of input.months) {
          addToSeries(grantDisbursements, m, grant.disbursements.get(m) ?? 0);
        }
        warnings.push(...grant.warnings);
        break;
      }
    }
  }

  return { equityInflows, debtInflows, interestExpense, principalPayments, grantDisbursements, warnings };
}

// --- Task 10: Debt schedule ---

export interface DilutionInput {
  /** New capital being raised in this round. */
  raiseAmount: number;
  /** Pre-money valuation. */
  preMoney: number;
  /** Founders' ownership BEFORE this round, as a 0-100 percentage. */
  foundersOwnershipPct: number;
}

export interface DilutionResult {
  /** Post-money valuation (pre-money + raise). */
  postMoney: number;
  /** Dilution introduced by this round, as a 0-100 percentage. */
  dilutionPct: number;
  /** Founders' ownership AFTER the round, as a 0-100 percentage. */
  newFoundersOwnershipPct: number;
}

/**
 * Model a single dilutive raise (the interactive funding "dilution calculator").
 * Pure function — the only place this math is defined. UI widgets must call this
 * rather than computing post-money / dilution inline.
 */
export function computeDilution(input: DilutionInput): DilutionResult {
  const postMoney = D(input.preMoney).plus(input.raiseAmount);
  if (postMoney.lte(0)) {
    return {
      postMoney: 0,
      dilutionPct: 0,
      newFoundersOwnershipPct: input.foundersOwnershipPct,
    };
  }
  const dilution = D(input.raiseAmount).div(postMoney).mul(100);
  const newFounders = D(input.foundersOwnershipPct).mul(
    D(1).minus(dilution.div(100)),
  );
  return {
    postMoney: postMoney.toNumber(),
    dilutionPct: dilution.toNumber(),
    newFoundersOwnershipPct: newFounders.toNumber(),
  };
}

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
  if (safeParams.valuationCap && safeParams.valuationCap > 0 && preRoundFullyDilutedShares > 0) {
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
  const sharesIssued = winner.price.lte(0)
    ? 0
    : D(safeAmount).div(winner.price).floor().toNumber();
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

// --- Task 11: Grant disbursement + match warnings ---

export interface GrantComputeInput {
  roundId: string;
  roundName: string;
  params: GrantParams;
  cumulativeQualifyingSpend: Record<string, number>;
}

export interface GrantComputeResult {
  disbursements: MonthlySeries;
  warnings: GrantMatchWarning[];
}

/**
 * Phase 2 D §1.5 / D5: Grant disbursement + match warning.
 *
 * Disbursement triggers on the month each milestone's hitDate falls in (caller marks
 * milestones hit via the mark_grant_milestone_hit AI tool / direct API). Unhit
 * milestones produce no cash. Engine does NOT gate disbursement on match status — real
 * grants frequently allow partial-match or conditional clauses; gating is a
 * legal/operational decision the user owns. Warning surfaces the unmet condition so the
 * UI and AI can flag it.
 */
export function computeGrant(input: GrantComputeInput): GrantComputeResult {
  const disbursements: MonthlySeries = new Map();
  const warnings: GrantMatchWarning[] = [];

  for (const milestone of input.params.milestones) {
    if (!milestone.hitDate) continue;
    const month = milestone.hitDate.slice(0, 7);
    disbursements.set(month, (disbursements.get(month) ?? 0) + milestone.amount);

    if (input.params.matchRequirement) {
      const matchMonth = input.params.matchRequirement.asOf.slice(0, 7);
      const checkMonth = month >= matchMonth ? month : matchMonth;
      const actual = input.cumulativeQualifyingSpend[checkMonth] ?? 0;
      if (actual < input.params.matchRequirement.requiredAmount) {
        warnings.push({
          roundId: input.roundId,
          roundName: input.roundName,
          milestoneId: milestone.id,
          milestoneLabel: milestone.label,
          requiredAmount: input.params.matchRequirement.requiredAmount,
          actualAmount: actual,
          asOf: input.params.matchRequirement.asOf,
        });
      }
    }
  }
  return { disbursements, warnings };
}
