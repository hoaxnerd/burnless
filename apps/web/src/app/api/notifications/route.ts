import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listNotificationsForUser,
  countUnreadNotifications,
  markNotificationsRead,
} from "@burnless/db";
import { requireCompanyAccess, withErrorHandler } from "@/lib/api-helpers";

const LIST_LIMIT = 50;

export const GET = withErrorHandler(async (_request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const [notifications, unreadCount] = await Promise.all([
    listNotificationsForUser(ctx.userId, ctx.companyId, LIST_LIMIT),
    countUnreadNotifications(ctx.userId, ctx.companyId),
  ]);
  return NextResponse.json({ notifications, unreadCount });
});

const patchSchema = z
  .object({
    ids: z.array(z.string().max(100)).max(200).optional(),
    markAllRead: z.boolean().optional(),
  })
  .refine((v) => v.markAllRead || (v.ids && v.ids.length > 0), {
    message: "Provide ids[] or markAllRead:true",
  });

export const PATCH = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const body = patchSchema.parse(await request.json());
  await markNotificationsRead(ctx.userId, ctx.companyId, body.markAllRead ? { all: true } : { ids: body.ids });
  return NextResponse.json({ ok: true });
});
