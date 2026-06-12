import { NextResponse } from "next/server";
import { z } from "zod";
import { db, users } from "@burnless/db";
import { eq, and, ne } from "drizzle-orm";
import { getAuthUser, withErrorHandler, parseBody, errorResponse } from "@/lib/api-helpers";
import { getCapabilities } from "@/lib/capabilities";
import { applyRateLimit } from "@/lib/api-rate-limit";

const schema = z.object({ email: z.string().email() });

/**
 * S4a — authenticated email change. On cloud (emailVerification on) it resets
 * emailVerified + (re)sends verification; on self_host it just updates. §7.4.
 */
export const POST = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "auth");
  if (blocked) return blocked;

  const sessionUser = await getAuthUser();
  if (!sessionUser?.id) return errorResponse("Unauthorized", 401);

  const parsed = await parseBody(request, schema);
  if ("error" in parsed) return parsed.error;
  const { email } = parsed.data;

  const [collision] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, sessionUser.id)))
    .limit(1);
  if (collision) return NextResponse.json({ error: "That email is already in use" }, { status: 409 });

  const resetVerify = getCapabilities().emailVerification;
  await db
    .update(users)
    .set({ email, ...(resetVerify ? { emailVerified: null } : {}) })
    .where(eq(users.id, sessionUser.id));

  // NOTE (deferred): when resetVerify is true, (re)send a verification email by
  // reusing the register route's verification-token + email.provider path. Kept
  // best-effort. self_host (the S4a focus) never hits this branch.

  return NextResponse.json({ ok: true, email });
});
