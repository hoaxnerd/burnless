// ── Types ────────────────────────────────────────────────────────────────────

export type Step = "upload" | "map" | "preview" | "result";

export type ImportTarget = "transactions" | "funding-rounds";

export interface ParsedRow {
  [key: string]: string;
}

export interface DebitCreditAmount {
  debit: string;
  credit: string;
}

export interface ColumnMapping {
  target?: "transactions"; // optional + defaulted to keep all existing callers compiling
  date: string;
  /**
   * Either a single column name (single-column amount layout) OR a
   * `{ debit, credit }` pair when the source CSV splits outflows/inflows
   * across two columns. Phase 1 introduces the polymorphic shape; existing
   * callers that treat this as a `string` should narrow with `typeof` or
   * use the {@link getAmountColumn} helper.
   */
  amount: string | DebitCreditAmount;
  description: string;
  category: string;
  vendor?: string;
  notes?: string;
  externalId?: string;
}

/** New (Phase 2 D D9) — disjoint shape for funding round CSV imports. */
export interface FundingRoundColumnMapping {
  target: "funding-rounds";
  name: string;
  roundType: string;
  amount: string;
  date: string;
  closeDate?: string;
  valuationCap?: string;
  discountRate?: string;
  interestRate?: string;
  termMonths?: string;
  notes?: string;
}

/** Discriminated union used by autoMapColumns return type. */
export type AnyColumnMapping = ColumnMapping | FundingRoundColumnMapping;

export interface MappingConfidence {
  date: number;
  amount: number;
  description: number;
  category: number;
  vendor: number;
  notes: number;
  externalId: number;
}

export interface AccountOption {
  id: string;
  name: string;
  type: string;
  category: string;
}

export interface PreviewTransaction {
  date: string;
  amount: number;
  description: string | null;
  accountId: string;
  externalId: string;
  vendor?: string | null;
  notes?: string | null;
  isDuplicate?: boolean;
  suggestedCategory?: string;
  categoryConfidence?: number;
  metadata?: Record<string, unknown>;
  /**
   * User-supplied category override (DATA-08). When set, it replaces the
   * AI-suggested category and is threaded through executeImport's payload so
   * the server persists it instead of re-categorizing. Undefined = no override.
   */
  categoryOverride?: string;
  _edited?: boolean;
  _excluded?: boolean;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ index: number; message: string }>;
  batchId?: string;
}

export interface ImportBatch {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  accountName: string | null;
  rolledBackAt: string | null;
  createdAt: string;
}

// ── Column Mapping Patterns ──────────────────────────────────────────────────

/**
 * Pattern dictionary used by {@link autoMapColumns}. Keys cover both top-level
 * `ColumnMapping` slots AND the synthetic `debit` / `credit` sub-slots that
 * feed the polymorphic `amount` field.
 */
export const COLUMN_PATTERNS: Record<string, { patterns: RegExp[] }> = {
  date: {
    patterns: [
      /^date$/i,
      /^transaction.?date$/i,
      /^posted.?date$/i,
      /^posting.?date$/i,
      /date|posted|time|when|timestamp/i,
    ],
  },
  amount: {
    patterns: [
      /^amount$/i,
      /^transaction.?amount$/i,
      /^value$/i,
      /^net$/i,
      /amount|total|sum|value|price|cost/i,
    ],
  },
  debit: {
    patterns: [
      /^debit$/i,
      /^withdrawal$/i,
      /^outflow$/i,
      /^paid.?out$/i,
      /debit|withdrawal|outflow/i,
    ],
  },
  credit: {
    patterns: [
      /^credit$/i,
      /^deposit$/i,
      /^inflow$/i,
      /^paid.?in$/i,
      /credit|deposit|inflow/i,
    ],
  },
  description: {
    patterns: [
      /^description$/i,
      /^narration$/i,
      /^details?$/i,
      // Broad fallback — `memo` / `payee` / `vendor` / `merchant` are kept here
      // for back-compat with pre-Phase-1 CSVs that only had a single
      // free-text column. Higher-priority slots (`notes`, `vendor`) consume
      // those headers first when they exist as the explicit slot pattern.
      /description|narration|details|desc|narrat|detail|memo|note|payee|merchant|name|reference|vendor/i,
    ],
  },
  category: {
    patterns: [
      /^category$/i,
      /^type$/i,
      /^classification$/i,
      /category|tag|categ|classif|type|label|group|department/i,
    ],
  },
  vendor: {
    patterns: [
      /^vendor$/i,
      /^merchant$/i,
      /^payee$/i,
      /^supplier$/i,
      /vendor|merchant|payee|supplier/i,
    ],
  },
  notes: {
    patterns: [
      /^notes?$/i,
      /^remarks?$/i,
      /^comments?$/i,
      /^memo$/i,
      /notes|remarks|comments|memo/i,
    ],
  },
  externalId: {
    patterns: [
      /^id$/i,
      /^transaction.?id$/i,
      /^reference$/i,
      /^ref(?:erence)?.?(?:no|number)$/i,
      /external.?id|transaction.?id|reference/i,
    ],
  },
};

/** Pattern dictionary for funding-round column auto-detection (Phase 2 D D9). */
export const FUNDING_COLUMN_PATTERNS: Record<string, RegExp[]> = {
  name: [/^round\s*name$/i, /^name$/i, /^round$/i],
  roundType: [/^round\s*type$/i, /^type$/i, /^stage$/i],
  amount: [/amount\s*raised/i, /^amount$/i, /total\s*raised/i, /raise(d)?/i],
  date: [/signing\s*date/i, /^date$/i, /^signed$/i],
  closeDate: [/close\s*date/i, /closing/i],
  valuationCap: [/valuation\s*cap/i, /^cap$/i, /pre.?money\s*cap/i],
  discountRate: [/discount/i],
  interestRate: [/interest/i, /^rate$/i],
  termMonths: [/term/i, /maturity/i],
  notes: [/notes/i, /comment/i],
};

// ── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Returns the single amount column name when `mapping.amount` is a string;
 * returns `null` for the polymorphic `{ debit, credit }` shape. UI surfaces
 * that need to render a single column fall back to null; callers that need
 * a numeric amount should use {@link resolveAmount} instead.
 */
export function getAmountColumn(mapping: ColumnMapping): string | null {
  return typeof mapping.amount === "string" ? mapping.amount : null;
}

/**
 * Parse a possibly-formatted money string into a number. Strips common
 * currency glyphs / commas; treats parenthesized values as negative.
 * Returns 0 for missing / unparseable input.
 */
export function parseAmountCell(raw: string | undefined | null): number {
  if (!raw) return 0;
  // Apply paren-as-negative BEFORE stripping parens out of other glyph removal.
  const trimmed = raw.trim();
  const negated = trimmed.replace(/^\((.+)\)$/, "-$1");
  const cleaned = negated.replace(/[$,€£()]/g, "");
  if (!cleaned) return 0;
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/**
 * Resolve a row's amount given the polymorphic `mapping.amount`:
 *  - `string` → parse `row[col]`
 *  - `{ debit, credit }` → parse both, return `credit - debit`
 * Missing values yield 0.
 */
export function resolveAmount(
  row: Record<string, string>,
  amount: ColumnMapping["amount"],
): number {
  if (typeof amount === "string") {
    return parseAmountCell(row[amount]);
  }
  const debit = parseAmountCell(row[amount.debit]);
  const credit = parseAmountCell(row[amount.credit]);
  return credit - debit;
}

/**
 * Score a header against a slot's pattern list. Returns 0 if no pattern
 * matches; otherwise a confidence in (0, 1] based on which pattern matched
 * (earlier = more specific = higher score).
 */
function scoreHeader(header: string, patterns: RegExp[]): number {
  for (let pi = 0; pi < patterns.length; pi++) {
    if (patterns[pi]!.test(header)) {
      return Math.min(1 - pi * 0.15, 1);
    }
  }
  return 0;
}

/**
 * Pick the best (header, score) for a slot from `headers`, skipping any
 * header already in `used`. Returns null if no header scores > 0.
 */
function pickBest(
  headers: string[],
  used: Set<string>,
  patterns: RegExp[],
): { header: string; score: number } | null {
  let bestScore = 0;
  let bestHeader = "";
  for (const h of headers) {
    if (used.has(h)) continue;
    const s = scoreHeader(h, patterns);
    if (s > bestScore) {
      bestScore = s;
      bestHeader = h;
    }
  }
  return bestHeader ? { header: bestHeader, score: bestScore } : null;
}

/**
 * Auto-detect a column mapping from a CSV header row.
 *
 * Pass `opts.target` to switch between import modes:
 *   - `"transactions"` (default) — returns `ColumnMapping` (existing behaviour, back-compat)
 *   - `"funding-rounds"` — returns `FundingRoundColumnMapping`
 *
 * The return type widens to `AnyColumnMapping`; callers can narrow via `.target`.
 */
export function autoMapColumns(
  headers: string[],
  opts?: { target?: ImportTarget },
): { mapping: AnyColumnMapping; confidence: MappingConfidence } {
  const target = opts?.target ?? "transactions";

  if (target === "funding-rounds") {
    const usedFunding = new Set<string>();
    const pick = (slot: keyof typeof FUNDING_COLUMN_PATTERNS) => {
      const picked = pickBest(headers, usedFunding, FUNDING_COLUMN_PATTERNS[slot]!);
      if (picked) {
        usedFunding.add(picked.header);
        return { header: picked.header, score: picked.score };
      }
      return null;
    };
    const name = pick("name");
    const roundType = pick("roundType");
    const amount = pick("amount");
    const date = pick("date");
    const closeDate = pick("closeDate");
    const valuationCap = pick("valuationCap");
    const discountRate = pick("discountRate");
    const interestRate = pick("interestRate");
    const termMonths = pick("termMonths");
    const notes = pick("notes");

    const mapping: FundingRoundColumnMapping = {
      target: "funding-rounds",
      name: name?.header ?? "",
      roundType: roundType?.header ?? "",
      amount: amount?.header ?? "",
      date: date?.header ?? "",
      closeDate: closeDate?.header,
      valuationCap: valuationCap?.header,
      discountRate: discountRate?.header,
      interestRate: interestRate?.header,
      termMonths: termMonths?.header,
      notes: notes?.header,
    };
    // Funding mapping does not use MappingConfidence (which is transaction-shaped) — zero-fill
    // every key so the return type stays consistent. UI surface for funding doesn't read confidence.
    const confidence: MappingConfidence = {
      date: date?.score ?? 0,
      amount: amount?.score ?? 0,
      description: 0,
      category: 0,
      vendor: 0,
      notes: notes?.score ?? 0,
      externalId: 0,
    };
    return { mapping, confidence };
  }

  // Transaction branch — existing implementation unchanged.
  const mapping: ColumnMapping = {
    date: "",
    amount: "",
    description: "",
    category: "",
  };
  const confidence: MappingConfidence = {
    date: 0,
    amount: 0,
    description: 0,
    category: 0,
    vendor: 0,
    notes: 0,
    externalId: 0,
  };
  const used = new Set<string>();

  // 1. date
  const datePick = pickBest(headers, used, COLUMN_PATTERNS.date!.patterns);
  if (datePick) {
    mapping.date = datePick.header;
    confidence.date = datePick.score;
    used.add(datePick.header);
  }

  // 2. debit/credit pair — try first; on failure, fall back to single amount
  const debitPick = pickBest(headers, used, COLUMN_PATTERNS.debit!.patterns);
  const creditPick = pickBest(
    headers,
    new Set([...used, ...(debitPick ? [debitPick.header] : [])]),
    COLUMN_PATTERNS.credit!.patterns,
  );

  if (
    debitPick &&
    creditPick &&
    debitPick.score >= 0.6 &&
    creditPick.score >= 0.6
  ) {
    mapping.amount = { debit: debitPick.header, credit: creditPick.header };
    confidence.amount = Math.max(debitPick.score, creditPick.score);
    used.add(debitPick.header);
    used.add(creditPick.header);
  } else {
    const amountPick = pickBest(
      headers,
      used,
      COLUMN_PATTERNS.amount!.patterns,
    );
    if (amountPick) {
      mapping.amount = amountPick.header;
      confidence.amount = amountPick.score;
      used.add(amountPick.header);
    }
  }

  // 3. remaining slots
  // Order matters when patterns overlap (e.g. "Memo" matches both `notes`
  // and the broad `description` fallback). Specific slots run first; the
  // broad description fallback only fires for headers nothing else claimed.
  const remaining = [
    "vendor",
    "notes",
    "category",
    "externalId",
    "description",
  ] as const;
  for (const field of remaining) {
    const pick = pickBest(headers, used, COLUMN_PATTERNS[field]!.patterns);
    if (pick) {
      mapping[field] = pick.header;
      confidence[field] = pick.score;
      used.add(pick.header);
    }
  }

  return { mapping, confidence };
}

/**
 * Pluralize a noun against a count (DATA-06). Returns just the noun form
 * (caller renders the count) so it composes with `{n} {pluralize(n, "row")}`.
 * Default plural is `noun + "s"`; pass `plural` for irregulars.
 */
export function pluralize(count: number, noun: string, plural?: string): string {
  return count === 1 ? noun : (plural ?? `${noun}s`);
}

/**
 * Pure per-row transform for the preview inline editor (DATA-03 + DATA-08).
 * Returns the SAME row reference when the edit is a no-op so React bails out of
 * the re-render AND the "Edited" flag is never spuriously set — opening the
 * editor and blurring with no change must not mark the row edited.
 *
 *  - `amount`   → parse to number; ignore NaN; no-op if equal to current amount.
 *  - `category` → DATA-08 override; no-op if equal to the effective category
 *                 (override if set, else the AI suggestion); empty string clears.
 *  - text       → normalize null/undefined vs "" before comparing.
 */
export function applyPreviewRowEdit(
  row: PreviewTransaction,
  field: string,
  value: string,
): PreviewTransaction {
  if (field === "amount") {
    const num = parseFloat(value);
    if (isNaN(num)) return row;
    if (num === row.amount) return row;
    return { ...row, amount: num, _edited: true };
  }
  if (field === "category") {
    const current = row.categoryOverride ?? row.suggestedCategory ?? "";
    if (value === current) return row;
    return { ...row, categoryOverride: value || undefined, _edited: true };
  }
  const existing = (row[field as keyof PreviewTransaction] as string | null | undefined) ?? "";
  if (value === existing) return row;
  return { ...row, [field]: value, _edited: true };
}

export function confidenceColor(c: number): string {
  if (c >= 0.8) return "text-success-600 bg-success-50 dark:bg-success-950 dark:text-success-400";
  if (c >= 0.5) return "text-warning-600 bg-warning-50 dark:bg-warning-950 dark:text-warning-400";
  return "text-surface-500 bg-surface-100 dark:bg-surface-800 dark:text-surface-400";
}

export function confidenceLabel(c: number): string {
  if (c >= 0.8) return "High confidence";
  if (c >= 0.5) return "Needs review";
  return "Not detected";
}
