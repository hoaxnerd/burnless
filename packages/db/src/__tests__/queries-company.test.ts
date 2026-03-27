import { describe, it, expect, beforeAll, vi } from "vitest";
import { getTestDb } from "./setup";

// Mock the db import used by query functions — point it at PGLite
vi.mock("../index", () => ({
  get db() {
    // Lazily resolve so setup.ts has time to initialize
    return getTestDb();
  },
}));

import { getCompanyForUser, getUserWithCompany, getCompanyById } from "../queries/company";
import { createUser, createCompany, createMember } from "./factories";

describe("company queries", () => {
  let userId: string;
  let companyId: string;

  beforeAll(async () => {
    const user = await createUser({ email: "company-test-1@test.burnless.app" });
    userId = user.id;
    const company = await createCompany(userId, { name: "Acme Inc" });
    companyId = company.id;
    await createMember(companyId, userId, { role: "owner" });
  });

  describe("getCompanyForUser", () => {
    it("returns companyId and role for a user with membership", async () => {
      const result = await getCompanyForUser(userId);
      expect(result).not.toBeNull();
      expect(result!.companyId).toBe(companyId);
      expect(result!.role).toBe("owner");
    });

    it("returns null for a user with no company", async () => {
      const loner = await createUser({ email: "loner@test.burnless.app" });
      const result = await getCompanyForUser(loner.id);
      expect(result).toBeNull();
    });
  });

  describe("getUserWithCompany", () => {
    it("returns user fields with company membership", async () => {
      const result = await getUserWithCompany(userId);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(userId);
      expect(result!.companyId).toBe(companyId);
      expect(result!.role).toBe("owner");
      expect(result!.email).toContain("@test.burnless.app");
    });

    it("returns null for nonexistent user", async () => {
      const result = await getUserWithCompany("00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });
  });

  describe("getCompanyById", () => {
    it("returns the company row", async () => {
      const result = await getCompanyById(companyId);
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Acme Inc");
      expect(result!.stage).toBe("pre_seed");
      expect(result!.currency).toBe("USD");
    });

    it("returns null for nonexistent company", async () => {
      const result = await getCompanyById("00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });
  });
});
