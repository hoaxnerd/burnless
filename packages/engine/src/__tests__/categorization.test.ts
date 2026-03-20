import { describe, it, expect } from "vitest";
import {
  categorizeTransaction,
  categorizeTransactions,
  DEFAULT_CATEGORIZATION_RULES,
  type CategorizationRule,
} from "../categorization";

describe("categorization", () => {
  describe("categorizeTransaction", () => {
    it("categorizes known SaaS vendors", () => {
      const result = categorizeTransaction("AWS Monthly Bill");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("operating_expense");
      expect(result!.subcategory).toBe("Software & Tools");
      expect(result!.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("categorizes Slack subscription", () => {
      const result = categorizeTransaction("Slack Technologies Inc");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Software & Tools");
    });

    it("categorizes payroll providers", () => {
      const result = categorizeTransaction("Gusto Payroll Processing");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Payroll");
      expect(result!.confidence).toBe(0.95);
    });

    it("categorizes marketing spend", () => {
      const result = categorizeTransaction("Google Ads Campaign #1234");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Marketing");
    });

    it("categorizes revenue transactions", () => {
      const result = categorizeTransaction("Stripe payout received");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("revenue");
    });

    it("categorizes payment processing fees", () => {
      const result = categorizeTransaction("Stripe fee for transaction");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Payment Processing");
    });

    it("categorizes legal services", () => {
      const result = categorizeTransaction("Cooley LLP legal fees");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Legal & Compliance");
    });

    it("categorizes travel expenses", () => {
      const result = categorizeTransaction("United Airlines SFO-NYC");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Travel & Entertainment");
    });

    it("categorizes insurance", () => {
      const result = categorizeTransaction("D&O Insurance Premium Q1");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Insurance");
    });

    it("categorizes interest income", () => {
      const result = categorizeTransaction("Interest income earned");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("other_income");
      expect(result!.subcategory).toBe("Interest Income");
    });

    it("categorizes fundraising", () => {
      const result = categorizeTransaction("Series A funding received");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("equity");
      expect(result!.subcategory).toBe("Fundraising");
    });

    it("returns null for unrecognized descriptions", () => {
      const result = categorizeTransaction("xyzzy random gibberish 12345");
      expect(result).toBeNull();
    });

    it("returns null for empty string", () => {
      const result = categorizeTransaction("");
      expect(result).toBeNull();
    });

    it("is case insensitive", () => {
      const lower = categorizeTransaction("aws monthly bill");
      const upper = categorizeTransaction("AWS MONTHLY BILL");
      expect(lower).not.toBeNull();
      expect(upper).not.toBeNull();
      expect(lower!.category).toBe(upper!.category);
      expect(lower!.subcategory).toBe(upper!.subcategory);
    });

    it("returns the highest confidence match when multiple rules match", () => {
      // "Stripe fee" matches both Payment Processing (0.95) and potentially others
      const result = categorizeTransaction("Stripe fee for processing");
      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("uses custom rules when provided", () => {
      const customRules: CategorizationRule[] = [
        {
          pattern: /\bcustom\b/i,
          category: "cogs",
          subcategory: "Custom Category",
          confidence: 1.0,
        },
      ];
      const result = categorizeTransaction("Custom vendor payment", customRules);
      expect(result).not.toBeNull();
      expect(result!.category).toBe("cogs");
      expect(result!.subcategory).toBe("Custom Category");
    });
  });

  describe("categorizeTransactions (batch)", () => {
    it("categorizes multiple descriptions", () => {
      const descriptions = [
        "AWS Monthly Bill",
        "Gusto Payroll",
        "Random unknown thing",
        "Google Ads Campaign",
      ];
      const results = categorizeTransactions(descriptions);

      expect(results.size).toBe(3); // 3 matched, 1 unknown omitted
      expect(results.has(0)).toBe(true); // AWS
      expect(results.has(1)).toBe(true); // Gusto
      expect(results.has(2)).toBe(false); // unrecognized
      expect(results.has(3)).toBe(true); // Google Ads
    });

    it("returns empty map for empty array", () => {
      const results = categorizeTransactions([]);
      expect(results.size).toBe(0);
    });

    it("returns empty map when nothing matches", () => {
      const results = categorizeTransactions(["zzzzz", "qqqqq"]);
      expect(results.size).toBe(0);
    });

    it("preserves correct indices", () => {
      const descriptions = ["nope", "nope", "AWS bill", "nope"];
      const results = categorizeTransactions(descriptions);
      expect(results.size).toBe(1);
      expect(results.has(2)).toBe(true);
      expect(results.get(2)!.subcategory).toBe("Software & Tools");
    });
  });

  describe("DEFAULT_CATEGORIZATION_RULES", () => {
    it("has a reasonable number of rules", () => {
      expect(DEFAULT_CATEGORIZATION_RULES.length).toBeGreaterThan(100);
    });

    it("all rules have valid confidence between 0 and 1", () => {
      for (const rule of DEFAULT_CATEGORIZATION_RULES) {
        expect(rule.confidence).toBeGreaterThan(0);
        expect(rule.confidence).toBeLessThanOrEqual(1);
      }
    });

    it("all rules have non-empty subcategory", () => {
      for (const rule of DEFAULT_CATEGORIZATION_RULES) {
        expect(rule.subcategory.length).toBeGreaterThan(0);
      }
    });
  });
});
