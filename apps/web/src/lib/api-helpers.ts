import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "./auth";
import { db, companies, getCompanyForUser } from "@burnless/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { canPerformAction, type GatedAction, type Plan } from "./feature-gate";
import { ScenarioSafetyError } from "./scenario-middleware";
import { ConfirmableError, serializeConfirmable } from "./confirmable-error";

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

/**
 * ERR-01: turn a ZodError into a human-readable sentence instead of leaking the
 * raw JSON issue array (ZodError.message). Used by parseBody (the 72-route path)
 * AND withErrorHandler so a validation 400 never ships machine output to users.
 * Guarded by apps/web/src/__tests__/parsebody-returns-friendly-error.test.ts.
 */
export function friendlyZodMessage(err: unknown): string {
  if (err instanceof ZodError) {
    const parts = err.errors.map((issue) => {
      const field = issue.path.join(".");
      return field ? `${field}: ${issue.message}` : issue.message;
    });
    return parts.length ? parts.join("; ") : "Invalid request body";
  }
  return "Invalid request body";
}

/**
 * AUTHZ-01: auth + company context AND editor+ write authority. editor/admin/owner
 * may write; viewer is blocked. A solo founder is owner so is never locked out.
 * Returns the ctx on success, or `{ error }` (401/403) to bail.
 */
export async function requireCompanyWrite() {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return { error: roleErr } as const;
  return ctx;
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
    .select({ billingPlan: companies.billingPlan })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const plan = company?.billingPlan;
  if (plan === "pro" || plan === "team") return plan;
  return "free";
}

/**
 * Pull safe request metadata (method, path, request id) for logging. Never reads
 * the body, query, or any header beyond the correlation id. Defensive: some route
 * handlers are declared `withErrorHandler(async () => …)` with no Request arg, so
 * args[0] can be undefined — return safe fallbacks rather than throw.
 */
function safeRequestMeta(maybeRequest: unknown): {
  method: string;
  pathname: string;
  requestId: string | undefined;
} {
  const request = maybeRequest as Request | undefined;
  let pathname = "unknown";
  try {
    if (request?.url) pathname = new URL(request.url).pathname;
  } catch {
    /* malformed URL — keep fallback */
  }
  return {
    method: request?.method ?? "UNKNOWN",
    pathname,
    requestId: request?.headers?.get?.("x-request-id") ?? undefined,
  };
}

/**
 * Wrap a route handler with standardized error handling + baseline request
 * visibility. Catches unhandled errors, logs them, reports to Sentry, and returns
 * a safe 500. Also logs a concise completion line (method, path, status, duration)
 * at info level so a self-host operator running `burnless start` sees request
 * activity on stdout. Never logs bodies, query, or headers beyond the correlation
 * id. Overloaded for routes with and without dynamic params.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withErrorHandler<T extends (...args: any[]) => Promise<any>>(
  handler: T
): (...args: Parameters<T>) => Promise<NextResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapped = async (...args: any[]) => {
    const start = Date.now();
    try {
      const res = await handler(...args);
      // Baseline per-request visibility (E2): one info line per completed request.
      // info is the artifact's prod LOG_LEVEL floor, so this surfaces under
      // `burnless start` without a config change. On a platform that already has a
      // request logger (e.g. Vercel access logs) this is a small, structured echo —
      // not noisy duplication of bodies/headers.
      const { method, pathname, requestId } = safeRequestMeta(args[0]);
      const status = typeof res?.status === "number" ? res.status : undefined;
      logger("api").info(
        { requestId, method, pathname, status, durationMs: Date.now() - start },
        `${method} ${pathname} ${status ?? ""}`.trim()
      );
      return res;
    } catch (error) {
      const { method, pathname, requestId } = safeRequestMeta(args[0]);
      const log = logger("api");

      // Handled rejections (validation / scenario-safety / confirmable) return a
      // 4xx, not a 500. They still get a concise warn line so a self-host operator
      // can see *why* a request was rejected (e.g. a 409 scenario lockout is exactly
      // the kind of thing one needs to debug) — never the Zod issue array or the
      // confirmable payload, only a safe status + code.

      // Return 400 for validation errors instead of 500
      if (error instanceof ZodError) {
        log.warn({ requestId, method, pathname, status: 400 }, `${method} ${pathname} 400 validation`);
        return NextResponse.json(
          { error: friendlyZodMessage(error) },
          { status: 400 }
        );
      }

      // Return 409 when scenario safety check fails
      if (error instanceof ScenarioSafetyError) {
        log.warn({ requestId, method, pathname, status: 409, code: "SCENARIO_SAFETY" }, `${method} ${pathname} 409 scenario-safety`);
        return NextResponse.json(
          { error: error.message, code: "SCENARIO_SAFETY" },
          { status: 409 }
        );
      }

      // Return 409 when a mutation requires explicit confirmation from the client
      if (error instanceof ConfirmableError) {
        log.warn({ requestId, method, pathname, status: 409, code: "CONFIRMABLE" }, `${method} ${pathname} 409 confirmable`);
        return NextResponse.json(serializeConfirmable(error), { status: 409 });
      }

      log.error(
        { requestId, method, pathname, err: error instanceof Error ? error : undefined },
        `${method} ${pathname} failed`
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
    // ERR-01: ZodError -> friendly sentence; bad JSON / other -> generic. Never
    // leak ZodError.message (the raw issue-array JSON) to the user.
    return { error: errorResponse(friendlyZodMessage(e), 400) };
  }
}
