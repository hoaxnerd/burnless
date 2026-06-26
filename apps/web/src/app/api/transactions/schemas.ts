import { z } from "zod";
import { monetaryAmount } from "@/lib/financial-validation";

export const createSchema = z.object({
  accountId: z.string(),
  date: z.string().transform((s) => new Date(s)),
  amount: monetaryAmount(),
  description: z.string().nullable().default(null),
  vendor: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  source: z.enum(["manual", "import", "integration", "forecast"]).default("manual"),
  externalId: z.string().nullable().default(null),
  metadata: z.record(z.unknown()).nullable().default(null),
});

/**
 * Partial update schema for PATCH /api/transactions/[id]. Transactions are flat
 * actuals, so (unlike forecast lines) the account MAY change — `accountId` is
 * editable and re-runs the AUTHZ-02 ownership check in the [id] route.
 */
export const updateTransactionSchema = z.object({
  accountId: z.string(),
  date: z.string().transform((s) => new Date(s)),
  amount: monetaryAmount(),
  description: z.string().nullable(),
  vendor: z.string().nullable(),
  notes: z.string().nullable(),
}).partial();
