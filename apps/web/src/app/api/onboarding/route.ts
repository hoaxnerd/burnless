/**
 * POST /api/onboarding — Creates a company, base scenario, and initial
 * financial structure from the conversational onboarding data.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@burnless/db";
import {
  companies,
  companyMembers,
  scenarios,
  financialAccounts,
  departments,
  forecastLines,
  revenueStreams,
} from "@burnless/db";
import { getAuthUser, errorResponse } from "@/lib/api-helpers";

const onboardingSchema = z.object({
  company_name: z.string().min(1),
  stage: z.string(),
  business_model: z.string(),
  monthly_revenue: z.string().optional(),
  team_size: z.string().optional(),
  funding: z.string().optional(),
  main_expenses: z.string().optional(),
});

// Map user-friendly stage names to enum values
function parseStage(input: string): "pre_seed" | "seed" | "series_a" | "series_b" | "series_c_plus" | "bootstrapped" {
  const lower = input.toLowerCase();
  if (lower.includes("series b") || lower.includes("b+")) return "series_b";
  if (lower.includes("series a")) return "series_a";
  if (lower.includes("series c")) return "series_c_plus";
  if (lower.includes("seed") && !lower.includes("pre")) return "seed";
  if (lower.includes("pre")) return "pre_seed";
  if (lower.includes("bootstrap") || lower.includes("self")) return "bootstrapped";
  return "pre_seed";
}

function parseBusinessModel(input: string): "saas" | "marketplace" | "ecommerce" | "services" | "hardware" | "other" {
  const lower = input.toLowerCase();
  if (lower.includes("saas") || lower.includes("subscription")) return "saas";
  if (lower.includes("market")) return "marketplace";
  if (lower.includes("ecom") || lower.includes("e-com")) return "ecommerce";
  if (lower.includes("service") || lower.includes("consult") || lower.includes("agency")) return "services";
  if (lower.includes("hardware") || lower.includes("physical")) return "hardware";
  return "other";
}

function parseMoneyAmount(input: string): number {
  if (!input) return 0;
  const lower = input.toLowerCase().replace(/[,$\s]/g, "");
  if (lower.includes("0") && lower.length === 1) return 0;
  const match = lower.match(/(\d+\.?\d*)\s*(m|k|million|thousand)?/);
  if (!match) return 0;
  let amount = parseFloat(match[1]!);
  const suffix = match[2];
  if (suffix === "m" || suffix === "million") amount *= 1_000_000;
  else if (suffix === "k" || suffix === "thousand") amount *= 1_000;
  return Math.round(amount);
}

function parseTeamSize(input: string): number {
  const match = input.match(/(\d+)/);
  return match ? parseInt(match[1]!, 10) : 1;
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.id) return errorResponse("Unauthorized", 401);

  let body: z.infer<typeof onboardingSchema>;
  try {
    body = onboardingSchema.parse(await request.json());
  } catch {
    return errorResponse("Invalid onboarding data", 400);
  }

  const stage = parseStage(body.stage);
  const businessModel = parseBusinessModel(body.business_model);
  const monthlyRevenue = parseMoneyAmount(body.monthly_revenue ?? "0");
  const teamSize = parseTeamSize(body.team_size ?? "1");
  const totalFunding = parseMoneyAmount(body.funding ?? "0");

  // Create company
  const [company] = await db
    .insert(companies)
    .values({
      name: body.company_name,
      stage,
      businessModel,
      ownerId: user.id,
    })
    .returning();

  if (!company) return errorResponse("Failed to create company", 500);

  // Add user as owner
  await db.insert(companyMembers).values({
    companyId: company.id,
    userId: user.id,
    role: "owner",
  });

  // Create base scenario
  const [scenario] = await db
    .insert(scenarios)
    .values({
      companyId: company.id,
      name: "Base Plan",
      type: "base",
      isDefault: true,
      description: `Initial financial model for ${body.company_name}`,
    })
    .returning();

  if (!scenario) return errorResponse("Failed to create scenario", 500);

  // Create default financial accounts
  const defaultAccounts = [
    { name: "Revenue", type: "income" as const, category: "revenue" as const, isSystem: true },
    { name: "Cost of Goods Sold", type: "expense" as const, category: "cogs" as const, isSystem: true },
    { name: "Salaries & Payroll", type: "expense" as const, category: "operating_expense" as const, isSystem: false },
    { name: "Cloud Infrastructure", type: "expense" as const, category: "operating_expense" as const, isSystem: false },
    { name: "Marketing", type: "expense" as const, category: "operating_expense" as const, isSystem: false },
    { name: "Office & Admin", type: "expense" as const, category: "operating_expense" as const, isSystem: false },
    { name: "Software & Tools", type: "expense" as const, category: "operating_expense" as const, isSystem: false },
    { name: "Cash & Bank", type: "asset" as const, category: "asset" as const, isSystem: true },
    { name: "Equity", type: "equity" as const, category: "equity" as const, isSystem: true },
  ];

  const createdAccounts = await db
    .insert(financialAccounts)
    .values(
      defaultAccounts.map((a) => ({
        companyId: company.id,
        name: a.name,
        type: a.type,
        category: a.category,
        isSystem: a.isSystem,
      }))
    )
    .returning();

  // Create default departments
  const defaultDepts = ["Engineering", "Sales", "Marketing", "Operations", "General & Admin"];
  await db.insert(departments).values(
    defaultDepts.map((name) => ({ companyId: company.id, name }))
  );

  // Create initial revenue stream if user has revenue
  if (monthlyRevenue > 0) {
    const revenueType = businessModel === "saas" ? "subscription" : businessModel === "services" ? "services" : "one_time";
    await db.insert(revenueStreams).values({
      scenarioId: scenario.id,
      name: `${body.company_name} Revenue`,
      type: revenueType,
      parameters: revenueType === "subscription"
        ? { monthlyPrice: monthlyRevenue, startingCustomers: 1, monthlyGrowthRate: 5 }
        : { amount: monthlyRevenue },
    });
  }

  // Create initial forecast lines based on user's expense info
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), 0, 1);
  const periodEnd = new Date(now.getFullYear(), 11, 31);

  // Estimate expense allocation based on team size
  const avgSalary = teamSize > 0 ? Math.round((monthlyRevenue * 0.4) / teamSize) || 5000 : 5000;
  const expenseAccounts = createdAccounts.filter(
    (a) => a.category === "operating_expense"
  );

  // Create some basic forecast lines for operating expenses
  for (const account of expenseAccounts) {
    let monthlyAmount = 0;
    if (account.name === "Cloud Infrastructure") monthlyAmount = Math.max(500, Math.round(monthlyRevenue * 0.1));
    else if (account.name === "Marketing") monthlyAmount = Math.max(1000, Math.round(monthlyRevenue * 0.15));
    else if (account.name === "Office & Admin") monthlyAmount = Math.max(500, teamSize * 200);
    else if (account.name === "Software & Tools") monthlyAmount = Math.max(200, teamSize * 100);

    if (monthlyAmount > 0) {
      await db.insert(forecastLines).values({
        scenarioId: scenario.id,
        accountId: account.id,
        method: "fixed",
        parameters: { amount: monthlyAmount },
        startDate: periodStart,
        endDate: periodEnd,
      });
    }
  }

  return NextResponse.json(
    { companyId: company.id, scenarioId: scenario.id },
    { status: 201 }
  );
}
