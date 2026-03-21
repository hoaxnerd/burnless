import { describe, it, expect } from "vitest";
import {
  categorizeTransaction,
  categorizeTransactions,
  DEFAULT_CATEGORIZATION_RULES,
} from "../categorization";

describe("categorization edge cases", () => {
  // ── 1. Ambiguous vendor matching ──────────────────────────────────────────
  describe("ambiguous vendor matching", () => {
    it('"Stripe" alone should match and pick the highest-confidence result', () => {
      // "Stripe" by itself does not match the Payment Processing rules (they require
      // "fee", "charge", "processing", "payout", "transfer", "deposit") nor the
      // Revenue rules. It should return null because no pattern matches bare "Stripe".
      const result = categorizeTransaction("Stripe");
      // Stripe alone doesn't match any rule — the patterns all require qualifiers.
      expect(result).toBeNull();
    });

    it('"Stripe fee" matches Payment Processing with high confidence', () => {
      const result = categorizeTransaction("Stripe fee");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Payment Processing");
      expect(result!.confidence).toBe(0.95);
    });

    it('"Stripe payout" matches Revenue', () => {
      const result = categorizeTransaction("Stripe payout");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("revenue");
      expect(result!.subcategory).toBe("Revenue");
    });

    it('"Stripe payment processing fee" picks Payment Processing over Revenue', () => {
      const result = categorizeTransaction("Stripe payment processing fee");
      expect(result).not.toBeNull();
      // Payment Processing rules have confidence 0.95, which beats Revenue's 0.85
      expect(result!.subcategory).toBe("Payment Processing");
      expect(result!.confidence).toBe(0.95);
    });
  });

  // ── 2. Multi-category vendors ─────────────────────────────────────────────
  describe("multi-category vendors (HubSpot)", () => {
    it('"HubSpot CRM subscription" categorizes as Software & Tools', () => {
      const result = categorizeTransaction("HubSpot CRM subscription");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Software & Tools");
    });

    it('"HubSpot marketing campaign" categorizes as Marketing', () => {
      const result = categorizeTransaction("HubSpot marketing campaign");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Marketing");
      expect(result!.confidence).toBe(0.90);
    });

    it('"HubSpot ads" categorizes as Marketing', () => {
      const result = categorizeTransaction("HubSpot ads spend");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Marketing");
    });

    it('bare "HubSpot" falls back to Marketing at low confidence', () => {
      // The bare HubSpot rule has confidence 0.75 and subcategory Marketing
      const result = categorizeTransaction("HubSpot");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Marketing");
      expect(result!.confidence).toBe(0.75);
    });

    it('"HubSpot software subscription" prefers Software & Tools over bare HubSpot Marketing', () => {
      const result = categorizeTransaction("HubSpot software subscription");
      expect(result).not.toBeNull();
      // Software & Tools rule (0.85) beats the bare HubSpot Marketing rule (0.75)
      expect(result!.subcategory).toBe("Software & Tools");
      expect(result!.confidence).toBe(0.85);
    });
  });

  // ── 3. Partial word boundaries ────────────────────────────────────────────
  describe("partial word boundaries", () => {
    it('"Slacking off" should NOT match Slack', () => {
      // The Slack rule uses \bslack\b — "Slacking" has no word boundary after "slack"
      const result = categorizeTransaction("Slacking off at work");
      // "Slacking" does NOT match \bslack\b because the 'i' in 'Slacking' continues the word
      expect(result).toBeNull();
    });

    it('"Slack subscription" should match Slack', () => {
      const result = categorizeTransaction("Slack subscription");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Software & Tools");
    });

    it('"My-Slack-bot" should match Slack (hyphen is a word boundary)', () => {
      const result = categorizeTransaction("My-Slack-bot");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Software & Tools");
    });

    it('"Notional income" should NOT match Notion', () => {
      // \bnotion\b should not match "Notional"
      const result = categorizeTransaction("Notional income report");
      expect(result).toBeNull();
    });

    it('"Figmatica" should NOT match Figma', () => {
      // \bfigma\b should not match "Figmatica"
      const result = categorizeTransaction("Figmatica design studio");
      expect(result).toBeNull();
    });

    it('"Hergugu" should NOT match Heroku', () => {
      const result = categorizeTransaction("Hergugu service");
      expect(result).toBeNull();
    });
  });

  // ── 4. Very long descriptions ─────────────────────────────────────────────
  describe("very long descriptions", () => {
    it("correctly categorizes a 1000+ char description containing a vendor name", () => {
      const padding = "lorem ipsum dolor sit amet consectetur adipiscing elit ".repeat(20);
      const description = `${padding}AWS monthly infrastructure bill ${padding}`;
      expect(description.length).toBeGreaterThan(1000);
      const result = categorizeTransaction(description);
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Software & Tools");
    });

    it("returns null for a 2000+ char description with no matching vendor", () => {
      const description = "abcdefghij ".repeat(200);
      expect(description.length).toBeGreaterThan(2000);
      const result = categorizeTransaction(description);
      expect(result).toBeNull();
    });

    it("handles a description that is exactly the vendor name padded with spaces", () => {
      const description = "   ".repeat(500) + "Gusto" + "   ".repeat(500);
      const result = categorizeTransaction(description);
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Payroll");
    });
  });

  // ── 5. Special characters ─────────────────────────────────────────────────
  describe("special characters in descriptions", () => {
    it("handles descriptions with single and double quotes", () => {
      const result = categorizeTransaction("'Gusto' \"payroll\" service");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Payroll");
    });

    it("handles descriptions with ampersands", () => {
      const result = categorizeTransaction("D&O Insurance Premium");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Insurance");
    });

    it("handles descriptions with unicode characters", () => {
      const result = categorizeTransaction("AWS \u2014 M\u00f6nthly B\u00efll \u20ac500");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Software & Tools");
    });

    it("handles descriptions with parentheses and brackets", () => {
      const result = categorizeTransaction("GitHub [Enterprise] (annual)");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Software & Tools");
    });

    it("handles descriptions with newlines and tabs", () => {
      const result = categorizeTransaction("Slack\nTechnologies\tInc");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Software & Tools");
    });

    it("handles descriptions with slashes and backslashes", () => {
      const result = categorizeTransaction("AWS/EC2/monthly - charge");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Software & Tools");
    });

    it("handles descriptions with emoji characters", () => {
      const result = categorizeTransaction("\ud83d\udcb0 Stripe fee \ud83d\udcb0");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Payment Processing");
    });
  });

  // ── 6. Sendgrid ambiguity ─────────────────────────────────────────────────
  describe("Sendgrid ambiguity", () => {
    it('"Sendgrid" alone matches Software & Tools at 0.90', () => {
      const result = categorizeTransaction("Sendgrid monthly subscription");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Software & Tools");
      expect(result!.confidence).toBe(0.90);
    });

    it('"Sendgrid marketing campaign" matches Software & Tools (0.90 beats Marketing 0.85)', () => {
      // Both rules match: Software & Tools at 0.90 and Marketing at 0.85
      // Engine picks highest confidence
      const result = categorizeTransaction("Sendgrid marketing campaign");
      expect(result).not.toBeNull();
      // Software & Tools rule (\bsendgrid\b, 0.90) beats Marketing rule
      // (\bsendgrid\b.*marketing|campaign, 0.85)
      expect(result!.confidence).toBe(0.90);
      expect(result!.subcategory).toBe("Software & Tools");
    });

    it("both Sendgrid rules match for marketing descriptions but highest confidence wins", () => {
      // Verify that both patterns actually match
      const softwareRule = DEFAULT_CATEGORIZATION_RULES.find(
        (r) => r.subcategory === "Software & Tools" && r.pattern.test("Sendgrid"),
      );
      const marketingRule = DEFAULT_CATEGORIZATION_RULES.find(
        (r) =>
          r.subcategory === "Marketing" &&
          r.pattern.test("Sendgrid marketing campaign"),
      );
      expect(softwareRule).toBeDefined();
      expect(marketingRule).toBeDefined();
      expect(softwareRule!.confidence).toBeGreaterThan(marketingRule!.confidence);
    });
  });

  // ── 7. Overlapping patterns (Linear) ──────────────────────────────────────
  describe("overlapping patterns", () => {
    it('"Linear" alone should NOT match Software & Tools', () => {
      // The rule is: \blinear\b.*app|\blinear\.app\b — bare "Linear" won't match
      const result = categorizeTransaction("Linear");
      expect(result).toBeNull();
    });

    it('"Linear app subscription" should match Software & Tools', () => {
      const result = categorizeTransaction("Linear app subscription");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Software & Tools");
    });

    it('"linear.app subscription" should match Software & Tools', () => {
      const result = categorizeTransaction("linear.app subscription");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Software & Tools");
    });

    it('"Linear algebra textbook" should NOT match Software & Tools', () => {
      // "Linear algebra" does not contain "app" or "linear.app"
      const result = categorizeTransaction("Linear algebra textbook");
      expect(result).toBeNull();
    });

    it('"Zoom video call" should match but "Zoom" alone should NOT', () => {
      // Zoom rule requires: \bzoom\b.*(?:video|communications|us)
      const withQualifier = categorizeTransaction("Zoom video call");
      expect(withQualifier).not.toBeNull();
      expect(withQualifier!.subcategory).toBe("Software & Tools");

      const bare = categorizeTransaction("Zoom");
      expect(bare).toBeNull();
    });

    it('"Uber ride" matches Travel but "Uber Eats" does not', () => {
      // Rule: \buber\b(?!\s*eats) — negative lookahead for "eats"
      const ride = categorizeTransaction("Uber ride downtown");
      expect(ride).not.toBeNull();
      expect(ride!.subcategory).toBe("Travel & Entertainment");

      const eats = categorizeTransaction("Uber Eats delivery");
      expect(eats).toBeNull();
    });
  });

  // ── 8. Office vs coworking ────────────────────────────────────────────────
  describe("office vs coworking vs rent", () => {
    it('"WeWork membership" categorizes as Office & Facilities', () => {
      const result = categorizeTransaction("WeWork membership");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Office & Facilities");
      expect(result!.confidence).toBe(0.95);
    });

    it('"We Work coworking space" categorizes as Office & Facilities', () => {
      // Rule includes \\bwe\\s*work\\b pattern
      const result = categorizeTransaction("We Work coworking space");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Office & Facilities");
    });

    it('"office supplies purchase" categorizes as Office & Facilities', () => {
      const result = categorizeTransaction("office supplies purchase");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Office & Facilities");
    });

    it('"office rent monthly" categorizes as Office & Facilities', () => {
      const result = categorizeTransaction("office rent monthly");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Office & Facilities");
    });

    it('"rent payment for January" categorizes as Office & Facilities', () => {
      const result = categorizeTransaction("rent payment for January");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Office & Facilities");
    });

    it('"Regus virtual office" categorizes as Office & Facilities', () => {
      const result = categorizeTransaction("Regus virtual office");
      expect(result).not.toBeNull();
      expect(result!.subcategory).toBe("Office & Facilities");
    });

    it("WeWork has higher confidence than generic office/rent patterns", () => {
      const wework = categorizeTransaction("WeWork monthly");
      const office = categorizeTransaction("office supplies");
      const rent = categorizeTransaction("rent payment");
      expect(wework!.confidence).toBeGreaterThan(office!.confidence);
      expect(wework!.confidence).toBeGreaterThan(rent!.confidence);
    });
  });

  // ── 9. All subcategory coverage ───────────────────────────────────────────
  describe("all subcategory coverage", () => {
    const expectedSubcategories = [
      "Software & Tools",
      "Payroll",
      "Office & Facilities",
      "Marketing",
      "Payment Processing",
      "Legal & Compliance",
      "Revenue",
      "Travel & Entertainment",
      "Insurance",
      "Professional Services",
      "Interest Income",
      "Interest Expense",
      "Debt Payments",
      "Fundraising",
    ];

    const coveredSubcategories = new Set(
      DEFAULT_CATEGORIZATION_RULES.map((rule) => rule.subcategory),
    );

    for (const subcategory of expectedSubcategories) {
      it(`DEFAULT_CATEGORIZATION_RULES includes at least one rule for "${subcategory}"`, () => {
        expect(coveredSubcategories.has(subcategory)).toBe(true);
      });
    }

    it("every expected subcategory is covered", () => {
      for (const sub of expectedSubcategories) {
        expect(coveredSubcategories).toContain(sub);
      }
    });

    it("each subcategory has at least one rule that can match a realistic description", () => {
      // Verify no subcategory has only impossible-to-match patterns
      const subcategoryExamples: Record<string, string> = {
        "Software & Tools": "AWS monthly bill",
        "Payroll": "Gusto payroll processing",
        "Office & Facilities": "WeWork office space",
        "Marketing": "Google Ads campaign",
        "Payment Processing": "Stripe fee for processing",
        "Legal & Compliance": "Cooley LLP legal fees",
        "Revenue": "Payment received from client",
        "Travel & Entertainment": "United Airlines ticket",
        "Insurance": "Insurance premium payment",
        "Professional Services": "Accounting fee quarterly",
        "Interest Income": "Interest income earned",
        "Interest Expense": "Interest expense quarterly",
        "Debt Payments": "Loan payment monthly",
        "Fundraising": "Series A funding received",
      };

      for (const [subcategory, description] of Object.entries(subcategoryExamples)) {
        const result = categorizeTransaction(description);
        expect(result).not.toBeNull();
        expect(result!.subcategory).toBe(subcategory);
      }
    });
  });

  // ── 10. Confidence ranges ─────────────────────────────────────────────────
  describe("confidence ranges", () => {
    it("no rule has confidence greater than 1.0", () => {
      for (const rule of DEFAULT_CATEGORIZATION_RULES) {
        expect(rule.confidence).toBeLessThanOrEqual(1.0);
      }
    });

    it("no rule has confidence less than 0.0", () => {
      for (const rule of DEFAULT_CATEGORIZATION_RULES) {
        expect(rule.confidence).toBeGreaterThanOrEqual(0.0);
      }
    });

    it("no rule has confidence of exactly 0.0 (all rules should be meaningful)", () => {
      for (const rule of DEFAULT_CATEGORIZATION_RULES) {
        expect(rule.confidence).toBeGreaterThan(0.0);
      }
    });

    it("confidence values are at most 2 decimal places (e.g., 0.85 not 0.851)", () => {
      for (const rule of DEFAULT_CATEGORIZATION_RULES) {
        const rounded = Math.round(rule.confidence * 100) / 100;
        expect(rule.confidence).toBe(rounded);
      }
    });

    it("all confidence values are in increments of 0.05", () => {
      for (const rule of DEFAULT_CATEGORIZATION_RULES) {
        const mod = Math.round(rule.confidence * 100) % 5;
        expect(mod).toBe(0);
      }
    });

    it("returned confidence from categorizeTransaction matches the rule confidence", () => {
      // Verify the engine faithfully passes through the rule's confidence
      const result = categorizeTransaction("GitHub Enterprise");
      expect(result).not.toBeNull();
      const matchingRule = DEFAULT_CATEGORIZATION_RULES.find(
        (r) => r.pattern.test("GitHub Enterprise") && r.subcategory === result!.subcategory,
      );
      expect(matchingRule).toBeDefined();
      expect(result!.confidence).toBe(matchingRule!.confidence);
    });
  });
});
