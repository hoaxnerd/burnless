import { NextResponse } from "next/server";
import { z } from "zod";
import { db, users } from "@burnless/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getAuthUser, withErrorHandler, parseBody, errorResponse } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";

/**
 * SET-08 — authenticated self-serve password change.
 *
 * Self-scoped per-user action: gates on the session (not company role) — see the
 * self-scoped allowlist note in every-mutation-route-requires-role.test.ts. Lives
 * under api/auth/ so it is also covered by that test's `auth/` prefix exemption.
 *
 * New-password strength reuses the reset-password schema (8+ chars, upper/lower/
 * number). Errors route through withErrorHandler / friendlyZodMessage — never raw
 * Zod output (no-raw-server-error-render guard surface).
 */
const schema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

export const POST = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "auth");
  if (blocked) return blocked;

  // Require an authenticated session — prevents session-hijack password takeover.
  const sessionUser = await getAuthUser();
  if (!sessionUser?.id) return errorResponse("Unauthorized", 401);

  const parsed = await parseBody(request, schema);
  if ("error" in parsed) return parsed.error;
  const { currentPassword, newPassword } = parsed.data;

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  // No local password hash (e.g. OAuth-only account) — can't change a password.
  if (!user?.passwordHash) {
    return errorResponse(
      "This account has no password set. Use a social login or reset your password.",
      400
    );
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    return errorResponse("Current password is incorrect", 400);
  }

  const passwordHash = await hashPassword(newPassword);
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({ message: "Password changed successfully." });
});
