import { eq, and, type SQL } from "drizzle-orm";
import type { PgTable, TableConfig } from "drizzle-orm/pg-core";
import { db } from "../index";

type CompanyScopedTable = PgTable<TableConfig> & {
  id: any;
  companyId: any;
};

/**
 * Find a single record by ID, scoped to a company.
 * Returns the row or null.
 */
export async function findByIdForCompany<T extends CompanyScopedTable>(
  table: T,
  id: string,
  companyId: string,
) {
  const [row] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.companyId, companyId)))
    .limit(1);
  return (row as typeof table.$inferSelect) ?? null;
}

/**
 * Update a record by ID, scoped to a company.
 * Returns the updated row or null if not found.
 */
export async function updateForCompany<T extends CompanyScopedTable>(
  table: T,
  id: string,
  companyId: string,
  data: Partial<typeof table.$inferInsert>,
) {
  const [row] = await db
    .update(table)
    .set(data as any)
    .where(and(eq(table.id, id), eq(table.companyId, companyId)))
    .returning();
  return (row as typeof table.$inferSelect) ?? null;
}

/**
 * Delete a record by ID, scoped to a company.
 * Returns the deleted row or null if not found.
 */
export async function deleteForCompany<T extends CompanyScopedTable>(
  table: T,
  id: string,
  companyId: string,
) {
  const [row] = await db
    .delete(table)
    .where(and(eq(table.id, id), eq(table.companyId, companyId)))
    .returning();
  return (row as typeof table.$inferSelect) ?? null;
}

/**
 * List all records for a company.
 */
export async function listForCompany<T extends CompanyScopedTable>(
  table: T,
  companyId: string,
) {
  const rows = await db
    .select()
    .from(table)
    .where(eq(table.companyId, companyId));
  return rows as (typeof table.$inferSelect)[];
}
