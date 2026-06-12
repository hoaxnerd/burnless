import { describe, it, expect, vi } from "vitest";
import { getTestDb } from "../../__tests__/setup";

vi.mock("../../index", () => ({ get db() { return getTestDb(); } }));

import { createCompanyContext } from "../../__tests__/factories";
import { notifications } from "../../schema";
import {
  createNotification,
  listNotificationsForUser,
  countUnreadNotifications,
  markNotificationsRead,
} from "../notifications";

describe("notifications table", () => {
  it("inserts a row with sane defaults (id, readAt null, createdAt set)", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext();
    const [row] = await db
      .insert(notifications)
      .values({
        companyId: ctx.company.id,
        userId: ctx.user.id,
        category: "automation",
        title: "Job ran",
        body: "Updated MRR",
        severity: "success",
        link: "/automations",
      })
      .returning();
    expect(row!.id).toBeTruthy();
    expect(row!.readAt).toBeNull();
    expect(row!.severity).toBe("success");
    expect(row!.createdAt).toBeInstanceOf(Date);
  });
});

describe("notification query helpers", () => {
  it("createNotification + list returns newest-first, scoped to the user", async () => {
    const a = await createCompanyContext();
    const other = await createCompanyContext(); // different company+user
    await createNotification({ companyId: a.company.id, userId: a.user.id, category: "automation", title: "first" });
    await new Promise((r) => setTimeout(r, 5)); // distinct createdAt for deterministic newest-first order
    await createNotification({ companyId: a.company.id, userId: a.user.id, category: "automation", title: "second" });
    await createNotification({ companyId: other.company.id, userId: other.user.id, category: "x", title: "elsewhere" });

    const list = await listNotificationsForUser(a.user.id, a.company.id, 50);
    expect(list.map((n) => n.title)).toEqual(["second", "first"]); // newest first
    expect(list.some((n) => n.title === "elsewhere")).toBe(false); // not leaked across user/company
  });

  it("countUnreadNotifications + markNotificationsRead", async () => {
    const a = await createCompanyContext();
    const n1 = await createNotification({ companyId: a.company.id, userId: a.user.id, category: "c", title: "u1" });
    await createNotification({ companyId: a.company.id, userId: a.user.id, category: "c", title: "u2" });
    expect(await countUnreadNotifications(a.user.id, a.company.id)).toBe(2);

    await markNotificationsRead(a.user.id, a.company.id, { ids: [n1!.id] });
    expect(await countUnreadNotifications(a.user.id, a.company.id)).toBe(1);

    await markNotificationsRead(a.user.id, a.company.id, { all: true });
    expect(await countUnreadNotifications(a.user.id, a.company.id)).toBe(0);
  });
});
