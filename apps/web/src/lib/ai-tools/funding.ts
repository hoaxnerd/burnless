/**
 * Funding round tools — full CRUD + investor management + grant milestones + dilution modeling.
 * Phase 2 D §1.5 canonical schemas from @burnless/ai (roundType immutability enforced).
 */

import { db } from "@burnless/db";
import { fundingRounds, fundingRoundInvestors, companies } from "@burnless/db";
import { mutateInsert, mutateUpdate, mutateDelete, planResultJson } from "./scenario-mutate";
import { eq, and } from "drizzle-orm";
import { formatCurrency, formatPercent, isValidCurrency, type CurrencyCode } from "@burnless/types";
import { ratioToPct } from "@burnless/engine";
import {
  CreateFundingRoundSchema,
  UpdateFundingRoundSchema,
  DeleteFundingRoundSchema,
  AddFundingRoundInvestorSchema,
  MarkGrantMilestoneHitSchema,
  ModelDilutionSchema,
} from "@burnless/ai";
import type { ToolHandler } from "./types";
import { requireCompanyId } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getCompanyCurrency(companyId: string): Promise<{ currency: CurrencyCode; locale: string | undefined }> {
  const [company] = await db
    .select({ currency: companies.currency, locale: companies.locale })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return {
    currency: company?.currency && isValidCurrency(company.currency) ? company.currency : "USD",
    locale: company?.locale ?? undefined,
  };
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export const createFundingRound: ToolHandler = async (input, context) => {
  const parsed = CreateFundingRoundSchema.safeParse(input);
  if (!parsed.success) {
    return JSON.stringify({ success: false, error: parsed.error.message });
  }
  const data = parsed.data;
  const ctx = requireCompanyId(context);
  const { currency, locale } = await getCompanyCurrency(ctx.companyId);

  const res = await mutateInsert(ctx, "funding_round", fundingRounds, {
    companyId: ctx.companyId,
    name: data.name,
    type: data.roundType,
    amount: String(data.amount),
    date: new Date(data.date),
    closeDate: data.closeDate ? new Date(data.closeDate) : null,
    preMoneyValuation: data.preMoneyValuation != null ? String(data.preMoneyValuation) : null,
    dilutionPercent: data.dilutionPercent != null ? String(data.dilutionPercent) : null,
    notes: data.notes ?? null,
    parameters: (data.parameters as Record<string, unknown>) ?? {},
    isProjected: data.isProjected ?? false,
  });
  if ("planned" in res) return planResultJson(res.planned);
  const row = res.row;

  return JSON.stringify({
    success: true,
    fundingRoundId: row!.id,
    message: `Created ${data.name} (${data.roundType}): ${formatCurrency(data.amount, currency, locale)} on ${data.date}.`,
  });
};

export const updateFundingRound: ToolHandler = async (input, context) => {
  const parsed = UpdateFundingRoundSchema.safeParse(input);
  if (!parsed.success) {
    return JSON.stringify({ success: false, error: parsed.error.message });
  }
  const data = parsed.data;
  const ctx = requireCompanyId(context);

  const [existing] = await db
    .select({ id: fundingRounds.id, name: fundingRounds.name })
    .from(fundingRounds)
    .where(and(eq(fundingRounds.id, data.id), eq(fundingRounds.companyId, ctx.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Funding round not found or access denied" });
  }

  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.amount !== undefined) updates.amount = String(data.amount);
  if (data.date !== undefined) updates.date = new Date(data.date);
  if ("closeDate" in data && data.closeDate !== undefined) {
    updates.closeDate = data.closeDate ? new Date(data.closeDate) : null;
  }
  if ("preMoneyValuation" in data && data.preMoneyValuation !== undefined) {
    updates.preMoneyValuation = data.preMoneyValuation != null ? String(data.preMoneyValuation) : null;
  }
  if ("dilutionPercent" in data && data.dilutionPercent !== undefined) {
    updates.dilutionPercent = data.dilutionPercent != null ? String(data.dilutionPercent) : null;
  }
  if ("notes" in data && data.notes !== undefined) {
    updates.notes = data.notes;
  }
  if (data.parameters !== undefined) updates.parameters = data.parameters;
  if (data.isProjected !== undefined) updates.isProjected = data.isProjected;

  if (Object.keys(updates).length === 0) {
    return JSON.stringify({ success: false, error: "No fields to update" });
  }

  const res = await mutateUpdate(ctx, "funding_round", fundingRounds, data.id, updates);
  if ("planned" in res) return planResultJson(res.planned);

  return JSON.stringify({
    success: true,
    message: `Updated funding round "${data.name ?? existing.name}".`,
  });
};

export const deleteFundingRound: ToolHandler = async (input, context) => {
  const parsed = DeleteFundingRoundSchema.safeParse(input);
  if (!parsed.success) {
    return JSON.stringify({ success: false, error: parsed.error.message });
  }
  const data = parsed.data;
  const ctx = requireCompanyId(context);

  const [existing] = await db
    .select({ id: fundingRounds.id, name: fundingRounds.name })
    .from(fundingRounds)
    .where(and(eq(fundingRounds.id, data.id), eq(fundingRounds.companyId, ctx.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Funding round not found or access denied" });
  }

  const res = await mutateDelete(ctx, "funding_round", fundingRounds, data.id);
  if ("planned" in res) return planResultJson(res.planned);

  return JSON.stringify({
    success: true,
    message: `Deleted funding round "${existing.name}".`,
  });
};

export const addFundingRoundInvestor: ToolHandler = async (input, context) => {
  const parsed = AddFundingRoundInvestorSchema.safeParse(input);
  if (!parsed.success) {
    return JSON.stringify({ success: false, error: parsed.error.message });
  }
  const data = parsed.data;
  const ctx = requireCompanyId(context);

  // Verify the funding round belongs to this company
  const [round] = await db
    .select({ id: fundingRounds.id, name: fundingRounds.name })
    .from(fundingRounds)
    .where(and(eq(fundingRounds.id, data.fundingRoundId), eq(fundingRounds.companyId, ctx.companyId)));
  if (!round) {
    return JSON.stringify({ success: false, error: "Funding round not found or access denied" });
  }

  const { currency, locale } = await getCompanyCurrency(ctx.companyId);

  const [row] = await db
    .insert(fundingRoundInvestors)
    .values({
      fundingRoundId: data.fundingRoundId,
      name: data.name,
      email: data.email ?? null,
      amountInvested: String(data.amountInvested),
    })
    .returning();

  return JSON.stringify({
    success: true,
    investorId: row!.id,
    message: `Added investor "${data.name}" (${formatCurrency(data.amountInvested, currency, locale)}) to round "${round.name}".`,
  });
};

export const markGrantMilestoneHit: ToolHandler = async (input, context) => {
  const parsed = MarkGrantMilestoneHitSchema.safeParse(input);
  if (!parsed.success) {
    return JSON.stringify({ success: false, error: parsed.error.message });
  }
  const data = parsed.data;
  const ctx = requireCompanyId(context);

  const [round] = await db
    .select({ id: fundingRounds.id, name: fundingRounds.name, type: fundingRounds.type, parameters: fundingRounds.parameters })
    .from(fundingRounds)
    .where(and(eq(fundingRounds.id, data.fundingRoundId), eq(fundingRounds.companyId, ctx.companyId)));
  if (!round) {
    return JSON.stringify({ success: false, error: "Funding round not found or access denied" });
  }
  if (round.type !== "grant") {
    return JSON.stringify({ success: false, error: `Round "${round.name}" is not a grant (type: ${round.type})` });
  }

  const params = (round.parameters ?? {}) as Record<string, unknown>;
  const milestones = (params.milestones ?? []) as Array<Record<string, unknown>>;
  const idx = milestones.findIndex((m) => m.id === data.milestoneId);
  if (idx === -1) {
    return JSON.stringify({ success: false, error: `Milestone "${data.milestoneId}" not found in round "${round.name}"` });
  }

  milestones[idx] = { ...milestones[idx], hitDate: data.hitDate };
  const updatedParams = { ...params, milestones };

  const res = await mutateUpdate(ctx, "funding_round", fundingRounds, data.fundingRoundId, { parameters: updatedParams });
  if ("planned" in res) return planResultJson(res.planned);

  return JSON.stringify({
    success: true,
    message: `Marked milestone "${milestones[idx].label ?? data.milestoneId}" as hit on ${data.hitDate} for grant "${round.name}".`,
  });
};

export const modelDilution: ToolHandler = async (input, context) => {
  const parsed = ModelDilutionSchema.safeParse(input);
  if (!parsed.success) {
    return JSON.stringify({ success: false, error: parsed.error.message });
  }
  const data = parsed.data;
  const ctx = requireCompanyId(context);
  const { currency, locale } = await getCompanyCurrency(ctx.companyId);

  const roundAmount = data.roundAmount;
  const preMoneyValuation = data.preMoneyValuation;
  // Schema uses 0–100 range; normalize to fractions for math
  const existingOwnership = data.existingOwnershipPercent / 100;
  const optionPool = (data.optionPoolPercent ?? 0) / 100;

  const postMoneyValuation = preMoneyValuation + roundAmount;
  const newInvestorOwnership = roundAmount / postMoneyValuation;
  const founderPostRound = existingOwnership * (1 - newInvestorOwnership - optionPool);

  const capTable = {
    preRound: {
      founders: existingOwnership,
      previousInvestors: 1.0 - existingOwnership,
    },
    postRound: {
      founders: founderPostRound,
      previousInvestors: (1.0 - existingOwnership) * (1 - newInvestorOwnership - optionPool),
      newInvestor: newInvestorOwnership,
      optionPool,
    },
    dilution: {
      founderDilution: existingOwnership - founderPostRound,
      founderDilutionPercent: existingOwnership > 0 ? (existingOwnership - founderPostRound) / existingOwnership : 0,
    },
  };

  return JSON.stringify({
    success: true,
    roundDetails: {
      roundAmount,
      preMoneyValuation,
      postMoneyValuation,
      pricePerPercent: preMoneyValuation / 100,
    },
    capTable,
    existingRounds: data.existingRounds ?? [],
    message: `Modeled dilution for ${formatCurrency(roundAmount, currency, locale)} round at ${formatCurrency(preMoneyValuation, currency, locale)} pre-money. Founders diluted from ${formatPercent(ratioToPct(existingOwnership), locale, 1)} to ${formatPercent(ratioToPct(founderPostRound), locale, 1)}.`,
  });
};
