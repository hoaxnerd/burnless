import { eq, sql } from "drizzle-orm";
import { db } from "../index";
import { companies } from "../schema";

/**
 * True when the company has any revenue stream, expense (transaction),
 * headcount plan, or funding round. Used by the currency-change flow —
 * per umbrella §1.6 the UI requires confirmation before changing currency
 * once financial data exists.
 *
 * Implemented via db.select() (not db.execute()) so the return shape is
 * normalized across drivers — postgres-js's db.execute returns RowList<T[]>
 * (the array itself), while pglite's returns { rows: T[] }. db.select()
 * always returns an array.
 */
export async function hasFinancialData(companyId: string): Promise<boolean> {
  const [row] = await db
    .select({
      has: sql<boolean>`(
        EXISTS(SELECT 1 FROM revenue_streams WHERE company_id = ${companyId})
        OR EXISTS(SELECT 1 FROM transactions WHERE company_id = ${companyId})
        OR EXISTS(SELECT 1 FROM headcount_plans WHERE company_id = ${companyId})
        OR EXISTS(SELECT 1 FROM funding_rounds WHERE company_id = ${companyId})
      )`,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return row?.has === true;
}
