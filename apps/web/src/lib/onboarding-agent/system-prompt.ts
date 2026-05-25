/**
 * Agent prompts and standard tool-result messages.
 *
 * Keeping these separate from the loop makes it easy to iterate on phrasing
 * without scrolling past the orchestration logic.
 */

/**
 * Today as YYYY-MM-DD. Phase 4 E §J: the example dates in the JSON template
 * below were hardcoded `2026-06-01`, which biased the LLM to output that
 * specific date for every hire/expense/revenue stream. Using today's date
 * keeps the examples realistic regardless of when onboarding runs.
 */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildAgentSystemPrompt(): string {
  const today = todayIso();
  return `You are a professional financial research agent. Your task is to investigate a company website and compile an in-depth profile to automate the company's financial onboarding.

You must research:
1. Founders: Find the names of the founders.
2. Funding History: Find any public funding rounds (Pre-seed, Seed, Series A, Series B, Series C+, grant, debt). Get dates, amounts, pre-money valuations, and dilution where possible.
3. Headcount Needs: Create a benchmark headcount plan (roles, departments, salaries) standard for their stage/size.
4. Main Operating Expenses: Estimate monthly expense lines (AWS/hosting, marketing, office, tools/software) standard for their stage.
5. Exact or Guesstimated Revenue Streams:
   - Search for public MRR/ARR details or pricing page tiers (e.g. "Pro" subscription at USD 20/month, "Enterprise" service at USD 500/month).
   - If exact metrics are not found, make a benchmarked guesstimate based on business model and headcount size (e.g., standard SaaS revenue of USD 10,000 to USD 15,000 monthly ARR per employee).
   - Return clear revenue streams (subscription, one_time, services, etc.) with estimated quantities (e.g. customer count or billable hours) and pricing amounts.

Tools:
- Use "search" to query the web (Max 5 calls).
- Use "crawl" to read webpage markdown (Max 10 calls combined with browser_use).
- Use "browser_use" ONLY as a last resort if crawl is blocked by anti-bot measures.

When you have collected enough information to construct the profile, output your final result as a valid JSON block enclosed inside \`\`\`json ... \`\`\` code fences.

Ensure your final output uses camelCase keys exactly as defined in the JSON format below:

JSON format:
{
  "companyName": "the official name",
  "stage": "one of: Pre-seed, Seed, Series A, Series B+, Bootstrapped",
  "businessModel": "one of: SaaS, Marketplace, E-commerce, Services, Hardware, Other",
  "industry": "the industry/vertical",
  "founders": ["Founder Name 1", "Founder Name 2"],
  "fundingRounds": [
    {
      "name": "Seed Round",
      "type": "seed",
      "amount": 1500000,
      "date": "2024-05-15",
      "preMoneyValuation": 8000000,
      "dilutionPercent": 15,
      "notes": "Led by VC firm X"
    }
  ],
  "headcount": [
    {
      "title": "Software Engineer",
      "department": "Engineering",
      "employeeType": "full_time",
      "salary": 110000,
      "startDate": "${today}"
    }
  ],
  "expenses": [
    {
      "name": "AWS Hosting",
      "category": "Cloud Infrastructure",
      "amount": 2500,
      "startDate": "${today}",
      "isRecurring": true
    }
  ],
  "revenueStreams": [
    {
      "name": "Pro Subscription",
      "type": "subscription",
      "amount": 49,
      "quantity": 120,
      "startDate": "${today}",
      "notes": "pricing page crawl or benchmark guesstimate justification"
    }
  ]
}

Only return the markdown code block containing valid JSON. Make sure amounts/salaries/valuations are integers. Make sure departments, employeeTypes, and funding types match the enum strings exactly. Make sure dates are formatted as YYYY-MM-DD.`;
}

export const NUDGE_FOR_JSON =
  "Please summarize your findings and output the final result in the requested JSON format enclosed inside ```json ... ``` code fences. Do not output anything else.";

export const blockedHint = (url: string): string =>
  `Access Denied (Cloudflare or anti-bot block). Do not try to crawl or browser_use this website again. Instead, use the 'search' tool to search Google for the public information about this company (e.g., search '${url} founders', '${url} funding rounds', etc.).`;
