import { describe, it, expect, beforeAll, vi } from "vitest";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import {
  findByIdForCompany,
  updateForCompany,
  deleteForCompany,
  listForCompany,
} from "../queries/crud";
import { financialAccounts } from "../schema";
import {
  createUser,
  createCompany,
  createFinancialAccount,
} from "./factories";

describe("generic CRUD queries", () => {
  let companyId: string;
  let otherCompanyId: string;

  beforeAll(async () => {
    const user = await createUser({ email: "crud-test@test.burnless.app" });
    const company = await createCompany(user.id, { name: "CRUD Co" });
    companyId = company.id;

    const user2 = await createUser({ email: "crud-other@test.burnless.app" });
    const other = await createCompany(user2.id, { name: "Other Co" });
    otherCompanyId = other.id;
  });

  describe("findByIdForCompany", () => {
    it("finds a record by ID scoped to the correct company", async () => {
      const account = await createFinancialAccount(companyId, {
        name: "Rent",
        type: "expense",
        category: "operating_expense",
      });

      const found = await findByIdForCompany(financialAccounts, account.id, companyId);
      expect(found).not.toBeNull();
      expect(found!.name).toBe("Rent");
    });

    it("returns null when company ID does not match", async () => {
      const account = await createFinancialAccount(companyId, { name: "Private" });
      const found = await findByIdForCompany(financialAccounts, account.id, otherCompanyId);
      expect(found).toBeNull();
    });

    it("returns null for nonexistent ID", async () => {
      const found = await findByIdForCompany(
        financialAccounts,
        "00000000-0000-0000-0000-000000000000",
        companyId,
      );
      expect(found).toBeNull();
    });
  });

  describe("updateForCompany", () => {
    it("updates a record and returns the updated row", async () => {
      const account = await createFinancialAccount(companyId, { name: "Old Name" });
      const updated = await updateForCompany(financialAccounts, account.id, companyId, {
        name: "New Name",
      });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("New Name");
    });

    it("returns null when updating a record from another company", async () => {
      const account = await createFinancialAccount(companyId, { name: "Cross-company" });
      const updated = await updateForCompany(financialAccounts, account.id, otherCompanyId, {
        name: "Hacked",
      });
      expect(updated).toBeNull();

      // Verify original is unchanged
      const original = await findByIdForCompany(financialAccounts, account.id, companyId);
      expect(original!.name).toBe("Cross-company");
    });
  });

  describe("deleteForCompany", () => {
    it("deletes a record and returns the deleted row", async () => {
      const account = await createFinancialAccount(companyId, { name: "To Delete" });
      const deleted = await deleteForCompany(financialAccounts, account.id, companyId);
      expect(deleted).not.toBeNull();
      expect(deleted!.name).toBe("To Delete");

      // Verify it's gone
      const found = await findByIdForCompany(financialAccounts, account.id, companyId);
      expect(found).toBeNull();
    });

    it("returns null when deleting from wrong company", async () => {
      const account = await createFinancialAccount(companyId, { name: "Protected" });
      const deleted = await deleteForCompany(financialAccounts, account.id, otherCompanyId);
      expect(deleted).toBeNull();

      // Verify still exists
      const found = await findByIdForCompany(financialAccounts, account.id, companyId);
      expect(found).not.toBeNull();
    });
  });

  describe("listForCompany", () => {
    it("returns all records for a company", async () => {
      // Create a fresh company to control exact count
      const user = await createUser({ email: "list-test@test.burnless.app" });
      const co = await createCompany(user.id, { name: "List Co" });
      await createFinancialAccount(co.id, { name: "A1" });
      await createFinancialAccount(co.id, { name: "A2" });
      await createFinancialAccount(co.id, { name: "A3" });

      const rows = await listForCompany(financialAccounts, co.id);
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.name).sort()).toEqual(["A1", "A2", "A3"]);
    });

    it("returns empty array for a company with no records", async () => {
      const user = await createUser({ email: "empty-list@test.burnless.app" });
      const co = await createCompany(user.id, { name: "Empty Co" });
      const rows = await listForCompany(financialAccounts, co.id);
      expect(rows).toEqual([]);
    });
  });
});
