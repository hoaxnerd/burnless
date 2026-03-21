// ── Types ────────────────────────────────────────────────────────────────────

export type Step = "upload" | "map" | "preview" | "result";

export interface ParsedRow {
  [key: string]: string;
}

export interface ColumnMapping {
  date: string;
  amount: string;
  description: string;
  category: string;
}

export interface MappingConfidence {
  date: number;
  amount: number;
  description: number;
  category: number;
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
  isDuplicate?: boolean;
  suggestedCategory?: string;
  categoryConfidence?: number;
  metadata?: Record<string, unknown>;
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

export const COLUMN_PATTERNS: Record<keyof ColumnMapping, { patterns: RegExp[] }> = {
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
      /^debit$/i,
      /^credit$/i,
      /amount|total|sum|debit|credit|value|price|cost/i,
    ],
  },
  description: {
    patterns: [
      /^description$/i,
      /^memo$/i,
      /^payee$/i,
      /^merchant$/i,
      /desc|memo|narrat|detail|note|payee|merchant|name|reference|vendor/i,
    ],
  },
  category: {
    patterns: [
      /^category$/i,
      /^type$/i,
      /^classification$/i,
      /categ|classif|type|label|group|department/i,
    ],
  },
};

// ── Helper Functions ─────────────────────────────────────────────────────────

export function autoMapColumns(headers: string[]): { mapping: ColumnMapping; confidence: MappingConfidence } {
  const mapping: ColumnMapping = { date: "", amount: "", description: "", category: "" };
  const confidence: MappingConfidence = { date: 0, amount: 0, description: 0, category: 0 };
  const used = new Set<string>();

  for (const field of ["date", "amount", "description", "category"] as const) {
    const { patterns } = COLUMN_PATTERNS[field];
    let bestScore = 0;
    let bestHeader = "";

    for (const h of headers) {
      if (used.has(h)) continue;
      for (let pi = 0; pi < patterns.length; pi++) {
        if (patterns[pi]!.test(h)) {
          const score = 1 - pi * 0.15;
          if (score > bestScore) {
            bestScore = score;
            bestHeader = h;
          }
          break;
        }
      }
    }

    if (bestHeader) {
      mapping[field] = bestHeader;
      confidence[field] = Math.min(bestScore, 1);
      used.add(bestHeader);
    }
  }

  return { mapping, confidence };
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
