import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import { notifications } from "../schema";

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface CreateNotificationInput {
  companyId: string;
  userId: string;
  category: string;
  title: string;
  body?: string | null;
  severity?: NotificationSeverity;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Generic post API — any feature creates a notification for a (company, user). */
export async function createNotification(input: CreateNotificationInput) {
  const [row] = await db
    .insert(notifications)
    .values({
      companyId: input.companyId,
      userId: input.userId,
      category: input.category,
      title: input.title,
      body: input.body ?? null,
      severity: input.severity ?? "info",
      link: input.link ?? null,
      metadata: input.metadata ?? null,
    })
    .returning();
  return row;
}

export async function listNotificationsForUser(userId: string, companyId: string, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.companyId, companyId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function countUnreadNotifications(userId: string, companyId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.companyId, companyId),
        isNull(notifications.readAt)
      )
    );
  return row?.count ?? 0;
}

/** Mark the user's own notifications read. `all` marks every unread; `ids` marks a subset. */
export async function markNotificationsRead(
  userId: string,
  companyId: string,
  opts: { ids?: string[]; all?: boolean }
): Promise<void> {
  const scope = and(eq(notifications.userId, userId), eq(notifications.companyId, companyId));
  if (opts.all) {
    await db.update(notifications).set({ readAt: new Date() }).where(and(scope, isNull(notifications.readAt)));
    return;
  }
  if (opts.ids && opts.ids.length > 0) {
    await db.update(notifications).set({ readAt: new Date() }).where(and(scope, inArray(notifications.id, opts.ids)));
  }
}
