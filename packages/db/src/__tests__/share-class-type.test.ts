import { describe, it, expect } from "vitest";
import "./setup";
import { eq } from "drizzle-orm";
import { getTestDb } from "./setup";
import { createUser, createCompany } from "./factories";
import { shareClasses } from "../schema";

// FAIL-4b: share_classes.class_type enum is the source of truth for
// common-vs-preferred classification (replaces the /common/i name regex).
describe("share_classes.classType (FAIL-4b)", () => {
  it("has a class_type column", () => {
    expect(Object.keys(shareClasses)).toContain("classType");
  });

  it("round-trips an explicit common/preferred classType", async () => {
    const db = getTestDb();
    const user = await createUser();
    const company = await createCompany(user.id);

    await db.insert(shareClasses).values([
      {
        id: "sc-ord",
        companyId: company.id,
        name: "Ordinary Shares", // name does NOT match /common/i
        classType: "common",
        totalAuthorized: "20000000",
        totalIssued: "10000000",
      },
      {
        id: "sc-pref",
        companyId: company.id,
        name: "Series A",
        classType: "preferred",
        totalAuthorized: "5000000",
        totalIssued: "3000000",
      },
    ]);

    const ord = await db
      .select()
      .from(shareClasses)
      .where(eq(shareClasses.id, "sc-ord"));
    expect(ord[0]?.classType).toBe("common");

    const pref = await db
      .select()
      .from(shareClasses)
      .where(eq(shareClasses.id, "sc-pref"));
    expect(pref[0]?.classType).toBe("preferred");
  });

  it("defaults classType to 'preferred' when omitted", async () => {
    const db = getTestDb();
    const user = await createUser();
    const company = await createCompany(user.id);

    await db.insert(shareClasses).values({
      id: "sc-default",
      companyId: company.id,
      name: "Series B",
      totalAuthorized: "5000000",
      totalIssued: "1000000",
    });

    const row = await db
      .select()
      .from(shareClasses)
      .where(eq(shareClasses.id, "sc-default"));
    expect(row[0]?.classType).toBe("preferred");
  });
});
