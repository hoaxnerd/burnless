import { describe, it, expect, vi } from "vitest";
import { getTestDb } from "../../__tests__/setup";

vi.mock("../../index", () => ({ get db() { return getTestDb(); } }));

import { createCompanyContext } from "../../__tests__/factories";
import { notifications } from "../../schema";

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
    expect(row.id).toBeTruthy();
    expect(row.readAt).toBeNull();
    expect(row.severity).toBe("success");
    expect(row.createdAt).toBeInstanceOf(Date);
  });
});
