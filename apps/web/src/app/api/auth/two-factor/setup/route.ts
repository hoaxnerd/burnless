import { NextResponse } from "next/server";
import { z } from "zod";
import { db, users } from "@burnless/db";
import { eq } from "drizzle-orm";
import { withErrorHandler, getAuthUser, errorResponse, parseBody } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import {
  generateTotpSecret,
  buildTotpUri,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCodes,
} from "@/lib/two-factor";

const verifySchema = z.object({
  code: z.string().length(6).regex(/^\d+$/),
});

/** GET /api/auth/two-factor/setup — Start 2FA enrollment */
export const GET = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "auth");
  if (blocked) return blocked;

  const user = await getAuthUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const [dbUser] = await db
    .select({ twoFactorEnabled: users.twoFactorEnabled, email: users.email })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (dbUser?.twoFactorEnabled) {
    return errorResponse("2FA is already enabled", 400);
  }

  const secret = generateTotpSecret();
  const uri = buildTotpUri(secret, dbUser?.email ?? user.email);

  // Generate QR code via dynamic import to avoid bundling issues
  const QRCode = await import("qrcode");
  const qrCodeDataUrl = await QRCode.toDataURL(uri);

  await db
    .update(users)
    .set({ twoFactorSecret: secret })
    .where(eq(users.id, user.id));

  return NextResponse.json({ secret, qrCode: qrCodeDataUrl, uri });
});

/** POST /api/auth/two-factor/setup — Confirm enrollment with TOTP code */
export const POST = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "auth");
  if (blocked) return blocked;

  const user = await getAuthUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const parsed = await parseBody(request, verifySchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  const [dbUser] = await db
    .select({
      twoFactorEnabled: users.twoFactorEnabled,
      twoFactorSecret: users.twoFactorSecret,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (dbUser?.twoFactorEnabled) {
    return errorResponse("2FA is already enabled", 400);
  }
  if (!dbUser?.twoFactorSecret) {
    return errorResponse("No 2FA setup in progress. Start with GET first.", 400);
  }

  const valid = verifyTotpCode(body.code, dbUser.twoFactorSecret);
  if (!valid) {
    return errorResponse("Invalid code. Check your authenticator app and try again.", 400);
  }

  const plainBackupCodes = generateBackupCodes();
  const hashedCodes = await hashBackupCodes(plainBackupCodes);

  await db
    .update(users)
    .set({
      twoFactorEnabled: true,
      twoFactorBackupCodes: JSON.stringify(hashedCodes),
    })
    .where(eq(users.id, user.id));

  return NextResponse.json({ enabled: true, backupCodes: plainBackupCodes });
});
