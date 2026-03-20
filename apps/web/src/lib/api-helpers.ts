import { NextResponse } from "next/server";
import { auth } from "./auth";
import { db } from "@burnless/db";
import { companyMembers, companies } from "@burnless/db";
import { eq, and } from "drizzle-orm";

/** Standard JSON error response. */
export function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Get authenticated user ID or return 401. */
export async function getAuthUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
}

/** Get a user's first company (for MVP, users have one company). */
export async function getUserCompany(userId: string) {
  const memberships = await db
    .select({ companyId: companyMembers.companyId, role: companyMembers.role })
    .from(companyMembers)
    .where(eq(companyMembers.userId, userId))
    .limit(1);
  const first = memberships[0];
  return first ?? null;
}

/** Require auth + company context. Returns 401/403 or {userId, companyId, role}. */
export async function requireCompanyAccess() {
  const user = await getAuthUser();
  const userId = user?.id;
  if (!userId) return { error: errorResponse("Unauthorized", 401) } as const;

  const membership = await getUserCompany(userId);
  if (!membership) return { error: errorResponse("No company found", 403) } as const;

  return {
    userId,
    companyId: membership.companyId,
    role: membership.role,
  } as const;
}

/** Role hierarchy for RBAC checks. */
type MemberRole = "owner" | "admin" | "editor" | "viewer";
const ROLE_LEVEL: Record<MemberRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

/**
 * Check that the authenticated user has at least the given role.
 * Returns an error response if the role is insufficient.
 */
export function requireRole(
  ctx: { role: string },
  minimumRole: MemberRole
): NextResponse | null {
  const userLevel = ROLE_LEVEL[ctx.role as MemberRole] ?? -1;
  const requiredLevel = ROLE_LEVEL[minimumRole];
  if (userLevel < requiredLevel) {
    return errorResponse(
      `Forbidden: requires ${minimumRole} role or higher`,
      403
    );
  }
  return null;
}

/** Get the company's subscription plan. */
export async function getCompanyPlan(
  companyId: string
): Promise<"free" | "pro" | "team"> {
  const [company] = await db
    .select({ stripePlan: companies.stripePlan })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const plan = company?.stripePlan;
  if (plan === "pro" || plan === "team") return plan;
  return "free";
}

/** Parse JSON body with Zod schema. */
export async function parseBody<T>(
  request: Request,
  schema: { parse: (data: unknown) => T }
): Promise<{ data: T } | { error: NextResponse }> {
  try {
    const body = await request.json();
    const data = schema.parse(body);
    return { data };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request body";
    return { error: errorResponse(message, 400) };
  }
}
