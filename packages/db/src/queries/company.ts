import { eq } from "drizzle-orm";
import { db } from "../index";
import { companies, companyMembers, users } from "../schema";

/**
 * Get a user's company membership (first company for MVP).
 * Returns companyId + role, or null if user has no company.
 */
export async function getCompanyForUser(userId: string) {
  const [membership] = await db
    .select({ companyId: companyMembers.companyId, role: companyMembers.role })
    .from(companyMembers)
    .where(eq(companyMembers.userId, userId))
    .limit(1);
  return membership ?? null;
}

/**
 * Get user record with their company membership.
 * Returns user + companyId + role, or null.
 */
export async function getUserWithCompany(userId: string) {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      companyId: companyMembers.companyId,
      role: companyMembers.role,
    })
    .from(users)
    .innerJoin(companyMembers, eq(companyMembers.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Get company by ID with basic fields.
 */
export async function getCompanyById(companyId: string) {
  const [row] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return row ?? null;
}
