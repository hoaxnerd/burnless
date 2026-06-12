import { NextResponse } from "next/server";
import { z } from "zod";
import { db, users } from "@burnless/db";
import { eq, and, ne } from "drizzle-orm";
import { hashPassword } from "@/lib/password";
import { getAuthUser, withErrorHandler, parseBody, errorResponse } from "@/lib/api-helpers";
import { getCapabilities } from "@/lib/capabilities";
import { applyRateLimit } from "@/lib/api-rate-limit";

const schema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  name: z.string().min(1).optional(),
});

/**
 * S4a — claim the local account: set a real email + password on the unclaimed
 * local owner. Only valid when autoLogin is on and the user currently has NO
 * password (claimed ≡ passwordHash != null). See spec §7.3.
 */
export const POST = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "auth");
  if (blocked) return blocked;

  if (!getCapabilities().autoLogin) return errorResponse("Not available on this deployment", 403);

  const sessionUser = await getAuthUser();
  if (!sessionUser?.id) return errorResponse("Unauthorized", 401);

  const parsed = await parseBody(request, schema);
  if ("error" in parsed) return parsed.error;
  const { email, password, name } = parsed.data;

  const [me] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);
  if (!me) return errorResponse("Unauthorized", 401);
  if (me.passwordHash) {
    return NextResponse.json(
      { error: "Account already claimed. Use Change Email / Change Password instead." },
      { status: 409 },
    );
  }

  const [collision] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, me.id)))
    .limit(1);
  if (collision) {
    return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  await db
    .update(users)
    .set({ email, passwordHash, ...(name ? { name } : {}) })
    .where(eq(users.id, me.id));

  return NextResponse.json({ ok: true, isClaimed: true, email });
});
