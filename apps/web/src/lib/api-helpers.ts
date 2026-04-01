import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "./auth";
import { db, companies, getCompanyForUser } from "@burnless/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { canPerformAction, type GatedAction, type Plan } from "./feature-gate";
import { ScenarioSafetyError } from "./scenario-middleware";

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
  return getCompanyForUser(userId);
}

/** Require auth + company context. Returns 401/403 or {userId, companyId, role}. */
export async function requireCompanyAccess() {
  const user = await getAuthUser();
  const userId = user?.id;
  if (!userId) return { error: errorResponse("Unauthorized", 401) } as const;

  const membership = await getCompanyForUser(userId);
  if (!membership) return { error: errorResponse("No company found", 403) } as const;

  // Sentry user context is set via instrumentation.ts at runtime

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

/**
 * Wrap a route handler with standardized error handling.
 * Catches unhandled errors, logs them, reports to Sentry, and returns a safe 500.
 * Overloaded for routes with and without dynamic params.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withErrorHandler<T extends (...args: any[]) => Promise<any>>(
  handler: T
): (...args: Parameters<T>) => Promise<NextResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapped = async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      const request = args[0] as Request;
      const pathname = new URL(request.url).pathname;
      const requestId = request.headers.get("x-request-id") ?? undefined;
      const log = logger("api");

      // Return 400 for validation errors instead of 500
      if (error instanceof ZodError) {
        return NextResponse.json(
          { error: error.errors[0]?.message ?? "Invalid request body" },
          { status: 400 }
        );
      }

      // Return 409 when scenario safety check fails
      if (error instanceof ScenarioSafetyError) {
        return NextResponse.json(
          { error: error.message, code: "SCENARIO_SAFETY" },
          { status: 409 }
        );
      }

      log.error(
        { requestId, method: request.method, pathname, err: error instanceof Error ? error : undefined },
        `${request.method} ${pathname} failed`
      );

      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
  return wrapped as (...args: Parameters<T>) => Promise<NextResponse>;
}

/**
 * One-liner plan feature gate for API routes.
 * Returns null if allowed, or a 403 response with upgrade hint.
 *
 * Usage:
 *   const gate = await requirePlanFeature(ctx.companyId, "data_room");
 *   if (gate) return gate;
 */
export async function requirePlanFeature(
  companyId: string,
  action: GatedAction,
  currentUsage?: number,
  plan?: Plan
): Promise<NextResponse | null> {
  const resolvedPlan = plan ?? (await getCompanyPlan(companyId));
  const result = canPerformAction(resolvedPlan, action, currentUsage);
  if (!result.allowed) {
    return NextResponse.json(
      {
        error: result.reason,
        upgradeTarget: result.upgradeTarget,
        code: "PLAN_LIMIT_REACHED",
      },
      { status: 403 }
    );
  }
  return null;
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
