/**
 * Auto-categorization engine for CSV transaction imports.
 *
 * Pure TypeScript, regex-based — no DB or ML dependencies.
 * Maps transaction descriptions to financial account categories
 * using a scored rule set. Returns the highest-confidence match.
 */

import type { AccountCategory } from "@burnless/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CategorizationRule {
  pattern: RegExp;
  category: AccountCategory;
  subcategory: string;
  confidence: number; // 0–1
}

export interface CategorizationResult {
  category: AccountCategory;
  subcategory: string;
  confidence: number;
}

// ── Default Rules ────────────────────────────────────────────────────────────

/** Case-insensitive helper */
const r = (source: string): RegExp => new RegExp(source, "i");

export const DEFAULT_CATEGORIZATION_RULES: CategorizationRule[] = [
  // ── SaaS / Software & Tools ──────────────────────────────────────────────
  { pattern: r("\\baws\\b|amazon\\s*web\\s*services"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.95 },
  { pattern: r("google\\s*cloud|gcp\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.95 },
  { pattern: r("\\bazure\\b|microsoft\\s*azure"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.95 },
  { pattern: r("\\bheroku\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.95 },
  { pattern: r("\\bvercel\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.95 },
  { pattern: r("\\bnetlify\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.95 },
  { pattern: r("\\bgithub\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.95 },
  { pattern: r("\\bgitlab\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.95 },
  { pattern: r("\\bbitbucket\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bslack\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.95 },
  { pattern: r("\\bnotion\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bfigma\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.95 },
  { pattern: r("\\blinear\\b.*app|\\blinear\\.app\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.85 },
  { pattern: r("\\bjira\\b|\\batlassian\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.95 },
  { pattern: r("\\bconfluence\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bzoom\\b.*(?:video|communications|us)"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bdatadog\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.95 },
  { pattern: r("\\bsentry\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bnew\\s*relic\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.95 },
  { pattern: r("\\bpagerduty\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\btwilio\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bsendgrid\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bpostmark\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.85 },
  { pattern: r("\\bdropbox\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\b1password\\b|\\bonepassword\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\blastpass\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bintercom\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bzendesk\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bsalesforce\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bhubspot\\b.*(?:crm|software|subscription)"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.85 },
  { pattern: r("\\bmixpanel\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bamplitude\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.85 },
  { pattern: r("\\bsegment\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.80 },
  { pattern: r("\\bcloudflare\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bmongodb\\b|\\bmongo\\s*atlas\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bsnowflake\\b.*(?:computing|data)"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.85 },
  { pattern: r("\\bdocker\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.85 },
  { pattern: r("\\bdigital\\s*ocean\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bopen\\s*ai\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\banthropic\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bgoogle\\s*workspace\\b|\\bg\\s*suite\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\bmicrosoft\\s*365\\b|\\boffice\\s*365\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },

  // ── Payroll ──────────────────────────────────────────────────────────────
  { pattern: r("\\bgusto\\b"), category: "operating_expense", subcategory: "Payroll", confidence: 0.95 },
  { pattern: r("\\brippling\\b"), category: "operating_expense", subcategory: "Payroll", confidence: 0.95 },
  { pattern: r("\\badp\\b"), category: "operating_expense", subcategory: "Payroll", confidence: 0.90 },
  { pattern: r("\\bdeel\\b"), category: "operating_expense", subcategory: "Payroll", confidence: 0.90 },
  { pattern: r("\\bremote\\.com\\b|\\bremote\\s*payroll\\b"), category: "operating_expense", subcategory: "Payroll", confidence: 0.90 },
  { pattern: r("\\bjustworks\\b"), category: "operating_expense", subcategory: "Payroll", confidence: 0.90 },
  { pattern: r("\\bpaychex\\b"), category: "operating_expense", subcategory: "Payroll", confidence: 0.90 },
  { pattern: r("payroll|salary\\s*(?:payment|disbursement)|wage\\s*(?:payment|disbursement)"), category: "operating_expense", subcategory: "Payroll", confidence: 0.85 },

  // ── Office & Facilities ──────────────────────────────────────────────────
  { pattern: r("\\bwework\\b|\\bwe\\s*work\\b"), category: "operating_expense", subcategory: "Office & Facilities", confidence: 0.95 },
  { pattern: r("\\bregus\\b|\\biwg\\b"), category: "operating_expense", subcategory: "Office & Facilities", confidence: 0.90 },
  { pattern: r("\\bindustrious\\b"), category: "operating_expense", subcategory: "Office & Facilities", confidence: 0.85 },
  { pattern: r("\\bknotel\\b"), category: "operating_expense", subcategory: "Office & Facilities", confidence: 0.85 },
  { pattern: r("\\boffice\\s*(?:supplies|depot|max|rent|lease)\\b"), category: "operating_expense", subcategory: "Office & Facilities", confidence: 0.85 },
  { pattern: r("\\bstaples\\b"), category: "operating_expense", subcategory: "Office & Facilities", confidence: 0.80 },
  { pattern: r("\\brent\\s*(?:payment|expense)\\b|\\blease\\s*payment\\b"), category: "operating_expense", subcategory: "Office & Facilities", confidence: 0.80 },
  { pattern: r("\\bjanitorial\\b|\\bcleaning\\s*service\\b"), category: "operating_expense", subcategory: "Office & Facilities", confidence: 0.80 },
  { pattern: r("\\butility\\b|\\butilities\\b|\\belectric\\b|\\bgas\\s*bill\\b|\\bwater\\s*bill\\b"), category: "operating_expense", subcategory: "Office & Facilities", confidence: 0.75 },

  // ── Marketing ────────────────────────────────────────────────────────────
  { pattern: r("google\\s*ads|\\bgoogle\\s*adwords\\b"), category: "operating_expense", subcategory: "Marketing", confidence: 0.95 },
  { pattern: r("facebook\\s*ads|\\bmeta\\s*ads\\b|\\bmeta\\s*platforms\\b.*ads"), category: "operating_expense", subcategory: "Marketing", confidence: 0.95 },
  { pattern: r("\\blinkedin\\s*(?:ads|marketing|campaign)\\b"), category: "operating_expense", subcategory: "Marketing", confidence: 0.90 },
  { pattern: r("\\btwitter\\s*ads\\b|\\bx\\s*ads\\b"), category: "operating_expense", subcategory: "Marketing", confidence: 0.90 },
  { pattern: r("\\btiktok\\s*ads\\b"), category: "operating_expense", subcategory: "Marketing", confidence: 0.90 },
  { pattern: r("\\bhubspot\\b.*(?:marketing|ads)"), category: "operating_expense", subcategory: "Marketing", confidence: 0.90 },
  { pattern: r("\\bhubspot\\b"), category: "operating_expense", subcategory: "Marketing", confidence: 0.75 },
  { pattern: r("\\bmailchimp\\b"), category: "operating_expense", subcategory: "Marketing", confidence: 0.90 },
  { pattern: r("\\bsendgrid\\b.*(?:marketing|campaign)"), category: "operating_expense", subcategory: "Marketing", confidence: 0.85 },
  { pattern: r("\\bconvertkit\\b"), category: "operating_expense", subcategory: "Marketing", confidence: 0.85 },
  { pattern: r("\\bsemrush\\b"), category: "operating_expense", subcategory: "Marketing", confidence: 0.90 },
  { pattern: r("\\bahrefs\\b"), category: "operating_expense", subcategory: "Marketing", confidence: 0.90 },
  { pattern: r("\\bmoz\\b.*(?:pro|analytics|seo)"), category: "operating_expense", subcategory: "Marketing", confidence: 0.80 },
  { pattern: r("\\bbuffer\\b"), category: "operating_expense", subcategory: "Marketing", confidence: 0.80 },
  { pattern: r("\\bhootsuite\\b"), category: "operating_expense", subcategory: "Marketing", confidence: 0.85 },
  { pattern: r("\\bcanva\\b"), category: "operating_expense", subcategory: "Marketing", confidence: 0.75 },
  { pattern: r("\\bmarketing\\s*(?:expense|spend|campaign)\\b"), category: "operating_expense", subcategory: "Marketing", confidence: 0.80 },
  { pattern: r("\\badvertising\\b|\\bad\\s*spend\\b"), category: "operating_expense", subcategory: "Marketing", confidence: 0.80 },

  // ── Payment Processing / Banking ─────────────────────────────────────────
  { pattern: r("\\bstripe\\b.*(?:fee|charge|processing)"), category: "operating_expense", subcategory: "Payment Processing", confidence: 0.95 },
  { pattern: r("\\bstripe\\s*(?:fee|payment)\\b"), category: "operating_expense", subcategory: "Payment Processing", confidence: 0.95 },
  { pattern: r("\\bpaypal\\b.*(?:fee|charge)"), category: "operating_expense", subcategory: "Payment Processing", confidence: 0.90 },
  { pattern: r("\\bsquare\\b.*(?:fee|processing)"), category: "operating_expense", subcategory: "Payment Processing", confidence: 0.90 },
  { pattern: r("\\bbraintree\\b.*(?:fee|charge)"), category: "operating_expense", subcategory: "Payment Processing", confidence: 0.90 },
  { pattern: r("\\binterchange\\s*fee\\b"), category: "operating_expense", subcategory: "Payment Processing", confidence: 0.90 },
  { pattern: r("\\bwire\\s*(?:transfer|fee)\\b"), category: "operating_expense", subcategory: "Payment Processing", confidence: 0.85 },
  { pattern: r("\\bach\\s*(?:fee|charge|transfer)\\b"), category: "operating_expense", subcategory: "Payment Processing", confidence: 0.85 },
  { pattern: r("\\bbank\\s*(?:fee|charge|service)\\b"), category: "operating_expense", subcategory: "Payment Processing", confidence: 0.85 },
  { pattern: r("\\bmerchant\\s*(?:fee|service)\\b"), category: "operating_expense", subcategory: "Payment Processing", confidence: 0.85 },
  { pattern: r("\\bprocessing\\s*fee\\b|\\btransaction\\s*fee\\b"), category: "operating_expense", subcategory: "Payment Processing", confidence: 0.80 },
  { pattern: r("\\bmercury\\b.*(?:fee|charge)"), category: "operating_expense", subcategory: "Payment Processing", confidence: 0.85 },
  { pattern: r("\\bsvb\\b.*(?:fee|charge)|\\bsilicon\\s*valley\\s*bank\\b.*fee"), category: "operating_expense", subcategory: "Payment Processing", confidence: 0.85 },

  // ── Legal & Compliance ───────────────────────────────────────────────────
  { pattern: r("\\blaw\\s*(?:firm|office|group)\\b|\\battorney\\b|\\blegal\\s*(?:fee|service|counsel)\\b"), category: "operating_expense", subcategory: "Legal & Compliance", confidence: 0.90 },
  { pattern: r("\\bllp\\b|\\besq\\.?\\b"), category: "operating_expense", subcategory: "Legal & Compliance", confidence: 0.75 },
  { pattern: r("\\bincorporation\\b|\\bcorp\\s*filing\\b|\\bstate\\s*filing\\b"), category: "operating_expense", subcategory: "Legal & Compliance", confidence: 0.85 },
  { pattern: r("\\bcompliance\\b|\\baudit\\s*(?:fee|service)\\b"), category: "operating_expense", subcategory: "Legal & Compliance", confidence: 0.80 },
  { pattern: r("\\btrademark\\b|\\bpatent\\b|\\bip\\s*filing\\b"), category: "operating_expense", subcategory: "Legal & Compliance", confidence: 0.85 },
  { pattern: r("\\bcooley\\b|\\bwilson\\s*sonsini\\b|\\bfenwick\\b|\\borrick\\b|\\bgunderson\\s*dettmer\\b"), category: "operating_expense", subcategory: "Legal & Compliance", confidence: 0.90 },
  { pattern: r("\\bcarta\\b"), category: "operating_expense", subcategory: "Legal & Compliance", confidence: 0.80 },
  { pattern: r("\\bdelaware\\s*(?:franchise|registered|agent)\\b"), category: "operating_expense", subcategory: "Legal & Compliance", confidence: 0.85 },

  // ── Revenue ──────────────────────────────────────────────────────────────
  { pattern: r("\\bpayment\\s*received\\b"), category: "revenue", subcategory: "Revenue", confidence: 0.90 },
  { pattern: r("\\binvoice\\s*(?:payment|paid|received)\\b"), category: "revenue", subcategory: "Revenue", confidence: 0.90 },
  { pattern: r("\\bcustomer\\s*(?:payment|deposit)\\b"), category: "revenue", subcategory: "Revenue", confidence: 0.85 },
  { pattern: r("\\bdeposit\\s*(?:received|from)\\b"), category: "revenue", subcategory: "Revenue", confidence: 0.80 },
  { pattern: r("\\bstripe\\s*(?:payout|transfer|deposit)\\b"), category: "revenue", subcategory: "Revenue", confidence: 0.85 },
  { pattern: r("\\bsubscription\\s*(?:payment|revenue|income)\\b"), category: "revenue", subcategory: "Revenue", confidence: 0.85 },
  { pattern: r("\\bsales\\s*(?:revenue|income|receipt)\\b"), category: "revenue", subcategory: "Revenue", confidence: 0.85 },
  { pattern: r("\\brevenue\\b"), category: "revenue", subcategory: "Revenue", confidence: 0.70 },

  // ── Travel & Entertainment ───────────────────────────────────────────────
  { pattern: r("\\bunited\\s*airlines?\\b|\\bdelta\\s*(?:air)?\\b|\\bamerican\\s*airlines?\\b|\\bsouthwest\\s*(?:air)?\\b|\\bjetblue\\b|\\balaska\\s*air\\b"), category: "operating_expense", subcategory: "Travel & Entertainment", confidence: 0.90 },
  { pattern: r("\\bairline\\b|\\bflight\\b|\\bairfare\\b"), category: "operating_expense", subcategory: "Travel & Entertainment", confidence: 0.85 },
  { pattern: r("\\bmarriott\\b|\\bhilton\\b|\\bhyatt\\b|\\bairbnb\\b|\\bhotel\\b"), category: "operating_expense", subcategory: "Travel & Entertainment", confidence: 0.85 },
  { pattern: r("\\buber\\b(?!\\s*eats)"), category: "operating_expense", subcategory: "Travel & Entertainment", confidence: 0.80 },
  { pattern: r("\\blyft\\b"), category: "operating_expense", subcategory: "Travel & Entertainment", confidence: 0.85 },
  { pattern: r("\\bexpensify\\b"), category: "operating_expense", subcategory: "Travel & Entertainment", confidence: 0.75 },
  { pattern: r("\\btrain\\s*ticket\\b|\\bamtrak\\b"), category: "operating_expense", subcategory: "Travel & Entertainment", confidence: 0.80 },
  { pattern: r("\\bcar\\s*rental\\b|\\bhertz\\b|\\bavis\\b|\\benterprise\\s*rent\\b"), category: "operating_expense", subcategory: "Travel & Entertainment", confidence: 0.85 },
  { pattern: r("\\btravel\\s*(?:expense|booking)\\b"), category: "operating_expense", subcategory: "Travel & Entertainment", confidence: 0.80 },

  // ── Insurance ────────────────────────────────────────────────────────────
  { pattern: r("\\binsurance\\s*(?:premium|payment|policy)\\b"), category: "operating_expense", subcategory: "Insurance", confidence: 0.90 },
  { pattern: r("\\binsurance\\b"), category: "operating_expense", subcategory: "Insurance", confidence: 0.80 },
  { pattern: r("\\bd&o\\s*insurance\\b|\\bdirectors?\\s*(?:and|&)\\s*officers?\\b"), category: "operating_expense", subcategory: "Insurance", confidence: 0.90 },
  { pattern: r("\\berrors?\\s*(?:and|&)\\s*omissions?\\b|\\be&o\\b"), category: "operating_expense", subcategory: "Insurance", confidence: 0.85 },
  { pattern: r("\\bgeneral\\s*liability\\b"), category: "operating_expense", subcategory: "Insurance", confidence: 0.85 },
  { pattern: r("\\bworkers?\\s*comp\\b"), category: "operating_expense", subcategory: "Insurance", confidence: 0.85 },
  { pattern: r("\\bhealth\\s*insurance\\b|\\bdental\\s*insurance\\b|\\bvision\\s*insurance\\b"), category: "operating_expense", subcategory: "Insurance", confidence: 0.90 },

  // ── Accounting & Finance ─────────────────────────────────────────────────
  { pattern: r("\\bquickbooks\\b|\\bxero\\b|\\bfreshbooks\\b"), category: "operating_expense", subcategory: "Software & Tools", confidence: 0.90 },
  { pattern: r("\\baccounting\\s*(?:fee|service)\\b|\\bbookkeeping\\b|\\bcpa\\b"), category: "operating_expense", subcategory: "Professional Services", confidence: 0.85 },
  { pattern: r("\\btax\\s*(?:preparation|filing|service|consulting)\\b"), category: "operating_expense", subcategory: "Professional Services", confidence: 0.85 },

  // ── Consulting / Professional Services ───────────────────────────────────
  { pattern: r("\\bconsulting\\s*(?:fee|service|engagement)\\b|\\bconsultant\\b"), category: "operating_expense", subcategory: "Professional Services", confidence: 0.80 },
  { pattern: r("\\bcontractor\\s*(?:payment|fee)\\b|\\bfreelance\\b"), category: "operating_expense", subcategory: "Professional Services", confidence: 0.80 },

  // ── Interest & Financing ─────────────────────────────────────────────────
  { pattern: r("\\binterest\\s*(?:income|earned|received)\\b"), category: "other_income", subcategory: "Interest Income", confidence: 0.85 },
  { pattern: r("\\binterest\\s*(?:expense|payment|charge)\\b"), category: "other_expense", subcategory: "Interest Expense", confidence: 0.85 },
  { pattern: r("\\bloan\\s*(?:payment|repayment|disbursement)\\b"), category: "liability", subcategory: "Debt Payments", confidence: 0.80 },

  // ── Fundraising ──────────────────────────────────────────────────────────
  { pattern: r("\\bfunding\\s*(?:received|round)\\b|\\binvestment\\s*received\\b"), category: "equity", subcategory: "Fundraising", confidence: 0.80 },
];

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * Categorize a single transaction description.
 *
 * Tests the description against every rule and returns the highest-confidence
 * match. If no rule matches, returns `null`.
 *
 * Optionally accepts a custom rule set; defaults to `DEFAULT_CATEGORIZATION_RULES`.
 */
export function categorizeTransaction(
  description: string,
  rules: CategorizationRule[] = DEFAULT_CATEGORIZATION_RULES,
): CategorizationResult | null {
  let best: CategorizationResult | null = null;

  for (const rule of rules) {
    if (rule.pattern.test(description)) {
      if (best === null || rule.confidence > best.confidence) {
        best = {
          category: rule.category,
          subcategory: rule.subcategory,
          confidence: rule.confidence,
        };
      }
    }
  }

  return best;
}

/**
 * Categorize a batch of transaction descriptions.
 *
 * Returns a `Map<number, CategorizationResult>` keyed by the index of each
 * description in the input array. Entries with no match are omitted from the map.
 */
export function categorizeTransactions(
  descriptions: string[],
  rules: CategorizationRule[] = DEFAULT_CATEGORIZATION_RULES,
): Map<number, CategorizationResult> {
  const results = new Map<number, CategorizationResult>();

  for (let i = 0; i < descriptions.length; i++) {
    const desc = descriptions[i];
    if (desc === undefined) continue;
    const result = categorizeTransaction(desc, rules);
    if (result !== null) {
      results.set(i, result);
    }
  }

  return results;
}
