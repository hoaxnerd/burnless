import { NextResponse } from "next/server";
import { z } from "zod";
import { db, inviteCodes, inviteCodeRedemptions, users } from "@burnless/db";
import { eq, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  requireCompanyAccess,
  requireRole,
  withErrorHandler,
  parseBody,
} from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";

function generateInviteCode(): string {
  return randomBytes(6).toString("hex").toUpperCase();
}

const createSchema = z.object({
  code: z.string().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/, "Code must be alphanumeric (hyphens and underscores allowed)").optional(),
  type: z.enum(["single_use", "multi_use"]).default("single_use"),
  maxRedemptions: z.number().int().min(1).max(10000).default(1),
  expiresAt: z.string().datetime().nullable().optional(),
  freePlatformDays: z.number().int().min(0).max(365).default(30),
  aiCreditsCents: z.number().int().min(0).max(100000).default(5000),
  note: z.string().max(500).nullable().optional(),
});

// GET /api/admin/invite-codes — list all codes with usage stats
export const GET = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "read");
  if (blocked) return blocked;

  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  const codes = await db
    .select()
    .from(inviteCodes)
    .orderBy(desc(inviteCodes.createdAt));

  // Fetch redemptions for each code
  const codesWithRedemptions = await Promise.all(
    codes.map(async (code) => {
      const redemptions = await db
        .select({
          id: inviteCodeRedemptions.id,
          userId: inviteCodeRedemptions.userId,
          userName: users.name,
          userEmail: users.email,
          redeemedAt: inviteCodeRedemptions.redeemedAt,
        })
        .from(inviteCodeRedemptions)
        .innerJoin(users, eq(users.id, inviteCodeRedemptions.userId))
        .where(eq(inviteCodeRedemptions.inviteCodeId, code.id));

      return { ...code, redemptions };
    })
  );

  return NextResponse.json(codesWithRedemptions);
});

// POST /api/admin/invite-codes — create invite code
export const POST = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "mutation");
  if (blocked) return blocked;

  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  const { data } = parsed;
  const code = data.code || generateInviteCode();

  // Check for duplicate code
  const [existing] = await db
    .select({ id: inviteCodes.id })
    .from(inviteCodes)
    .where(eq(inviteCodes.code, code))
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: "An invite code with this value already exists" },
      { status: 409 }
    );
  }

  const [created] = await db
    .insert(inviteCodes)
    .values({
      code,
      type: data.type,
      maxRedemptions: data.type === "single_use" ? 1 : data.maxRedemptions,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      freePlatformDays: data.freePlatformDays,
      aiCreditsCents: data.aiCreditsCents,
      createdBy: ctx.userId,
      note: data.note ?? null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
});
