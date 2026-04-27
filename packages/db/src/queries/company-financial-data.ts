import { sql } from "drizzle-orm";
import { db } from "../index";

/**
 * True when the company has any revenue stream, expense (transaction),
 * headcount plan, or funding round. Used by the currency-change flow —
 * per umbrella §1.6 the UI requires confirmation before changing currency
 * once financial data exists.
 */
export async function hasFinancialData(companyId: string): Promise<boolean> {
  const result = await db.execute<{ has: boolean }>(sql`
    SELECT (
      EXISTS(SELECT 1 FROM revenue_streams WHERE company_id = ${companyId})
      OR EXISTS(SELECT 1 FROM transactions WHERE company_id = ${companyId})
      OR EXISTS(SELECT 1 FROM headcount_plans WHERE company_id = ${companyId})
      OR EXISTS(SELECT 1 FROM funding_rounds WHERE company_id = ${companyId})
    ) AS has
  `);
  const row = result.rows[0];
  return row?.has === true;
}
