/**
 * Import validation test suite — BUR-71
 *
 * Tests the Zod schemas and helper functions used by /api/import.
 * Validates input validation, boundary limits, and data integrity.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import crypto from "crypto";

// ── Reproduce schemas from the import route ──────────────────────────────────

const importTransactionSchema = z.object({
  date: z.string(),
  amount: z.number(),
  description: z.string().nullable(),
  accountId: z.string(),
  externalId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const importSchema = z.object({
  transactions: z.array(importTransactionSchema).min(1).max(5000),
  dryRun: z.boolean().optional().default(false),
  fileName: z.string().optional().default("import.csv"),
  columnMapping: z.record(z.string()).optional(),
});

// ── Reproduce helpers from the import route ──────────────────────────────────

type ImportTransaction = z.infer<typeof importTransactionSchema>;

function generateExternalId(tx: ImportTransaction): string {
  const raw = `${tx.date}|${tx.amount}|${tx.description ?? ""}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
  return `import:${hash}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ── Import Transaction Schema ────────────────────────────────────────────────

describe("importTransactionSchema", () => {
  it("accepts valid transaction", () => {
    const result = importTransactionSchema.safeParse({
      date: "2026-03-15",
      amount: -150.99,
      description: "AWS Monthly Bill",
      accountId: "acc-123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null description", () => {
    const result = importTransactionSchema.safeParse({
      date: "2026-01-01",
      amount: 500,
      description: null,
      accountId: "acc-1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional externalId", () => {
    const result = importTransactionSchema.safeParse({
      date: "2026-01-01",
      amount: 100,
      description: "Test",
      accountId: "acc-1",
      externalId: "ext-abc",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.externalId).toBe("ext-abc");
  });

  it("accepts optional metadata", () => {
    const result = importTransactionSchema.safeParse({
      date: "2026-01-01",
      amount: 42,
      description: "With meta",
      accountId: "acc-1",
      metadata: { source: "mercury", row: 5 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing date", () => {
    const result = importTransactionSchema.safeParse({
      amount: 100,
      description: "Test",
      accountId: "acc-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing amount", () => {
    const result = importTransactionSchema.safeParse({
      date: "2026-01-01",
      description: "Test",
      accountId: "acc-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects string amount", () => {
    const result = importTransactionSchema.safeParse({
      date: "2026-01-01",
      amount: "$100.00",
      description: "Test",
      accountId: "acc-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing accountId", () => {
    const result = importTransactionSchema.safeParse({
      date: "2026-01-01",
      amount: 100,
      description: "Test",
    });
    expect(result.success).toBe(false);
  });

  it("accepts negative amounts (debits)", () => {
    const result = importTransactionSchema.safeParse({
      date: "2026-01-01",
      amount: -5000.50,
      description: "Office rent",
      accountId: "acc-1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts zero amount", () => {
    const result = importTransactionSchema.safeParse({
      date: "2026-01-01",
      amount: 0,
      description: "Void transaction",
      accountId: "acc-1",
    });
    expect(result.success).toBe(true);
  });
});

// ── Import Schema (Batch) ────────────────────────────────────────────────────

describe("importSchema", () => {
  const validTx = {
    date: "2026-01-01",
    amount: 100,
    description: "Test",
    accountId: "acc-1",
  };

  it("accepts valid import with single transaction", () => {
    const result = importSchema.safeParse({ transactions: [validTx] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dryRun).toBe(false);
      expect(result.data.fileName).toBe("import.csv");
    }
  });

  it("rejects empty transactions array", () => {
    const result = importSchema.safeParse({ transactions: [] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 5000 transactions", () => {
    const bigArray = Array.from({ length: 5001 }, (_, i) => ({
      ...validTx,
      amount: i,
    }));
    const result = importSchema.safeParse({ transactions: bigArray });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 5000 transactions", () => {
    const maxArray = Array.from({ length: 5000 }, (_, i) => ({
      ...validTx,
      amount: i,
    }));
    const result = importSchema.safeParse({ transactions: maxArray });
    expect(result.success).toBe(true);
  });

  it("defaults dryRun to false", () => {
    const result = importSchema.safeParse({ transactions: [validTx] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dryRun).toBe(false);
  });

  it("accepts dryRun: true", () => {
    const result = importSchema.safeParse({ transactions: [validTx], dryRun: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dryRun).toBe(true);
  });

  it("accepts custom fileName", () => {
    const result = importSchema.safeParse({
      transactions: [validTx],
      fileName: "mercury-export-2026-03.csv",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fileName).toBe("mercury-export-2026-03.csv");
  });

  it("accepts column mapping", () => {
    const result = importSchema.safeParse({
      transactions: [validTx],
      columnMapping: { date: "Transaction Date", amount: "Debit", description: "Memo" },
    });
    expect(result.success).toBe(true);
  });
});

// ── generateExternalId ───────────────────────────────────────────────────────

describe("generateExternalId", () => {
  it("generates deterministic ID from date|amount|description", () => {
    const tx: ImportTransaction = {
      date: "2026-01-15",
      amount: -99.99,
      description: "Slack monthly",
      accountId: "acc-1",
    };
    const id1 = generateExternalId(tx);
    const id2 = generateExternalId(tx);
    expect(id1).toBe(id2);
  });

  it("prefixes with 'import:'", () => {
    const tx: ImportTransaction = {
      date: "2026-01-01",
      amount: 100,
      description: "Test",
      accountId: "acc-1",
    };
    expect(generateExternalId(tx)).toMatch(/^import:[a-f0-9]{16}$/);
  });

  it("different amounts produce different IDs", () => {
    const base = { date: "2026-01-01", description: "Same", accountId: "acc-1" };
    const id1 = generateExternalId({ ...base, amount: 100 });
    const id2 = generateExternalId({ ...base, amount: 101 });
    expect(id1).not.toBe(id2);
  });

  it("different dates produce different IDs", () => {
    const base = { amount: 100, description: "Same", accountId: "acc-1" };
    const id1 = generateExternalId({ ...base, date: "2026-01-01" });
    const id2 = generateExternalId({ ...base, date: "2026-01-02" });
    expect(id1).not.toBe(id2);
  });

  it("different descriptions produce different IDs", () => {
    const base = { date: "2026-01-01", amount: 100, accountId: "acc-1" };
    const id1 = generateExternalId({ ...base, description: "Slack" });
    const id2 = generateExternalId({ ...base, description: "Notion" });
    expect(id1).not.toBe(id2);
  });

  it("null description treated as empty string", () => {
    const tx: ImportTransaction = {
      date: "2026-01-01",
      amount: 50,
      description: null,
      accountId: "acc-1",
    };
    const id = generateExternalId(tx);
    expect(id).toMatch(/^import:[a-f0-9]{16}$/);

    // Should be same as empty string
    const txEmpty: ImportTransaction = {
      date: "2026-01-01",
      amount: 50,
      description: "",
      accountId: "acc-1",
    };
    expect(generateExternalId(tx)).toBe(generateExternalId(txEmpty));
  });

  it("accountId is NOT part of the hash (duplicate detection across accounts)", () => {
    const base = { date: "2026-01-01", amount: 100, description: "Transfer" };
    const id1 = generateExternalId({ ...base, accountId: "acc-1" });
    const id2 = generateExternalId({ ...base, accountId: "acc-2" });
    // Same hash since accountId isn't in the hash input
    expect(id1).toBe(id2);
  });
});

// ── chunk helper ─────────────────────────────────────────────────────────────

describe("chunk", () => {
  it("splits array into chunks of given size", () => {
    const arr = [1, 2, 3, 4, 5];
    const result = chunk(arr, 2);
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns single chunk when array <= size", () => {
    const result = chunk([1, 2, 3], 5);
    expect(result).toEqual([[1, 2, 3]]);
  });

  it("handles empty array", () => {
    const result = chunk([], 10);
    expect(result).toEqual([]);
  });

  it("handles chunk size of 1", () => {
    const result = chunk([1, 2, 3], 1);
    expect(result).toEqual([[1], [2], [3]]);
  });

  it("handles exact division", () => {
    const result = chunk([1, 2, 3, 4], 2);
    expect(result).toEqual([[1, 2], [3, 4]]);
  });

  it("chunks 500 items into 5 chunks of 100", () => {
    const arr = Array.from({ length: 500 }, (_, i) => i);
    const result = chunk(arr, 100);
    expect(result).toHaveLength(5);
    expect(result[0]).toHaveLength(100);
    expect(result[4]).toHaveLength(100);
  });
});
