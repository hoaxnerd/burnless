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
  /**
   * Data-availability state (review H2, FAIL-2a). True when at least one pending
   * SAFE/convertible has a discount but NO valuation cap AND no implied round
   * price to convert against (pre-seed common case). The overhang for those
   * instruments is UNKNOWN — we deliberately do not fabricate 0 dilution as if
   * there were none. UI surfaces a "dilution needs a priced round to estimate"
   * ghost rather than a misleading 0%.
   */
  dilutionDataNeedsPricedRound: boolean;
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
  /**
   * Valuation date for convertible accrued-interest (FAIL-2b, review L1).
   * Convertibles accrue principal + ACT/365 interest from their `issueDate`
   * up to this date. Defaults to "today" when omitted.
   */
  asOfDate?: string;
  shareClasses: ShareClassInput[];
  optionPools: OptionPoolInput[];
  pendingSafes: Array<{
    id: string;
    amount: number;
    valuationCap?: number;
    discountRate?: number;
    /** Latest priced-round price/share, threaded by the adapter (FAIL-2a). */
    roundPricePerShare?: number;
  }>;
  pendingConvertibles: Array<{
    id: string;
    amount: number;
    valuationCap?: number;
    discountRate?: number;
    interestRate?: number;
    issueDate?: string;
    /** Latest priced-round price/share, threaded by the adapter (FAIL-2a). */
    roundPricePerShare?: number;
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
  // Option-pool overhang = unissued reserve only (reserved − granted).
  // Granted shares are already counted in commonStock, so adding the full
  // reserve would double-count the granted portion (FAIL-3).
  const optionPoolOverhang = input.optionPools.reduce(
    (sum, p) => sum + Math.max(0, p.totalReserved - p.totalGranted),
    0,
  );
  const preMoneyFD = commonStock + preferredStock + optionPoolOverhang;

  // Track whether any instrument's dilution is UNKNOWN for lack of a priced
  // reference (review H2): a discount-only SAFE/convertible with neither a
  // valuation cap nor an implied round price cannot be converted to shares —
  // we surface that as a data-availability state rather than fabricating 0.
  let dilutionDataNeedsPricedRound = false;

  /**
   * Shares a pending SAFE/convertible would convert into, taking the
   * holder-favourable (lowest) of the available conversion prices:
   *   - cap path:      valuationCap / preMoneyFD
   *   - discount path: roundPricePerShare × (1 − discountRate)
   * Returns 0 when neither price can be derived. Mutates the
   * `dilutionDataNeedsPricedRound` flag when a discount-only instrument has no
   * implied round price (so the caller can surface "needs priced round").
   */
  const overhangShares = (inst: {
    amount: number;
    valuationCap?: number;
    discountRate?: number;
    roundPricePerShare?: number;
  }): number => {
    const candidates: Decimal[] = [];
    if (inst.valuationCap && inst.valuationCap > 0 && preMoneyFD > 0) {
      candidates.push(D(inst.valuationCap).div(preMoneyFD));
    }
    if (
      inst.discountRate &&
      inst.discountRate > 0 &&
      inst.roundPricePerShare &&
      inst.roundPricePerShare > 0
    ) {
      candidates.push(D(inst.roundPricePerShare).mul(D(1).minus(inst.discountRate)));
    }
    if (candidates.length === 0) {
      // No cap and no implied price → dilution is UNKNOWN. Discount-only
      // instruments without a priced round flag the data-availability state;
      // we never fabricate a share count.
      if (inst.discountRate && inst.discountRate > 0) {
        dilutionDataNeedsPricedRound = true;
      }
      return 0;
    }
    // Lowest price = most shares for the holder (industry-standard SAFE clause).
    const price = candidates.reduce((a, b) => (b.lte(a) ? b : a));
    return price.lte(0) ? 0 : D(inst.amount).div(price).floor().toNumber();
  };

  // A convertible note converts principal + accrued interest (FAIL-2b). Accrual
  // uses ACT/365 day-count from the note's issueDate to the cap-table asOfDate,
  // consistent with the convertible schedule (Phase 3.3, review L1) so the
  // schedule and the cap table report the same accrued interest. Conversion
  // before issue (or no issueDate/rate) accrues 0 — never negative.
  const asOf = new Date(input.asOfDate ?? new Date().toISOString().slice(0, 10));
  const convertibleConvertedAmount = (c: {
    amount: number;
    interestRate?: number;
    issueDate?: string;
  }): number => {
    if (!c.interestRate || c.interestRate <= 0 || !c.issueDate) return c.amount;
    const issue = new Date(c.issueDate);
    const daysElapsed = Math.max(
      0,
      Math.round((asOf.getTime() - issue.getTime()) / 86_400_000),
    );
    const accrued = D(c.amount).mul(c.interestRate).mul(D(daysElapsed).div(365));
    return Number(D(c.amount).plus(accrued).toFixed(2));
  };

  // Per-instrument share counts (kept for holder-row emission so rows foot).
  const safeShares = input.pendingSafes.map((s) => ({
    inst: s,
    shares: overhangShares(s),
  }));
  const convertibleShares = input.pendingConvertibles.map((c) => ({
    inst: c,
    shares: overhangShares({ ...c, amount: convertibleConvertedAmount(c) }),
  }));

  const safeOverhang = safeShares.reduce((sum, x) => sum + x.shares, 0);
  const convertibleOverhang = convertibleShares.reduce(
    (sum, x) => sum + x.shares,
    0,
  );

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
    const unissued = Math.max(0, p.totalReserved - p.totalGranted);
    rows.push({
      holder: p.name,
      shareClass: "Option Pool",
      shares: unissued,
      ownershipPercent: totalFullyDiluted > 0 ? unissued / totalFullyDiluted : 0,
    });
  }
  // SAFE / convertible holder rows so the table foots to 100% (FAIL-2b).
  // Zero-share instruments (e.g. discount-only with no priced round) are skipped.
  for (const { inst, shares } of safeShares) {
    if (shares <= 0) continue;
    rows.push({
      holder: inst.id,
      shareClass: "SAFE",
      shares,
      ownershipPercent: totalFullyDiluted > 0 ? shares / totalFullyDiluted : 0,
    });
  }
  for (const { inst, shares } of convertibleShares) {
    if (shares <= 0) continue;
    rows.push({
      holder: inst.id,
      shareClass: "Convertible",
      shares,
      ownershipPercent: totalFullyDiluted > 0 ? shares / totalFullyDiluted : 0,
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
    dilutionDataNeedsPricedRound,
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
