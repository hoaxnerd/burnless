/**
 * Revenue modeling, funding rounds, and dilution tools — full CRUD.
 */

import { db } from "@burnless/db";
import { revenueStreams, fundingRounds, scenarios } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import type { ToolContext, ToolHandler } from "./types";
import {
  nameString,
  idString,
  optionalId,
  financialAmount,
  percentFraction,
  dateString,
} from "./types";

// ── Schemas ──────────────────────────────────────────────────────────────────

export const addRevenueStreamSchema = z.object({
  scenarioId: optionalId,
  name: nameString,
  type: z.enum(["subscription", "one_time", "usage_based", "services"]),
  parameters: z.record(z.unknown()).default({}),
});

export const addFundingRoundSchema = z.object({
  name: nameString,
  type: z.enum(["pre_seed", "seed", "series_a", "series_b", "series_c_plus", "debt", "grant"]),
  amount: financialAmount.refine((v) => v > 0, "Funding amount must be > 0"),
  date: dateString,
  preMoneyValuation: financialAmount.optional().nullable(),
  dilutionPercent: percentFraction.optional().nullable(),
  isProjected: z.boolean().default(true),
});

export const updateRevenueStreamSchema = z.object({
  id: idString,
  name: nameString.optional(),
  type: z.enum(["subscription", "one_time", "usage_based", "services"]).optional(),
  parameters: z.record(z.unknown()).optional(),
});

export const deleteRevenueStreamSchema = z.object({
  id: idString,
});

export const updateFundingRoundSchema = z.object({
  id: idString,
  name: nameString.optional(),
  type: z.enum(["pre_seed", "seed", "series_a", "series_b", "series_c_plus", "debt", "grant"]).optional(),
  amount: financialAmount.optional(),
  date: dateString.optional(),
  preMoneyValuation: financialAmount.optional().nullable(),
  dilutionPercent: percentFraction.optional().nullable(),
  isProjected: z.boolean().optional(),
});

export const deleteFundingRoundSchema = z.object({
  id: idString,
});

export const modelDilutionSchema = z.object({
  roundAmount: financialAmount.refine((v) => v > 0, "Round amount must be > 0"),
  preMoneyValuation: financialAmount.refine((v) => v > 0, "Pre-money valuation must be > 0"),
  existingOwnershipPercent: percentFraction.default(1.0),
  optionPoolPercent: percentFraction.default(0),
  existingRounds: z.array(z.object({
    name: z.string(),
    amount: z.number(),
    ownership: z.number(),
  })).default([]),
});

// ── Handlers ─────────────────────────────────────────────────────────────────

async function addRevenueStream(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof addRevenueStreamSchema>;
  const scenarioId = data.scenarioId || context.scenarioId;

  const [row] = await db
    .insert(revenueStreams)
    .values({
      scenarioId,
      name: data.name,
      type: data.type,
      parameters: data.parameters,
    })
    .returning();

  return JSON.stringify({
    success: true,
    revenueStreamId: row!.id,
    message: `Created revenue stream "${data.name}" (${data.type}).`,
  });
}

async function addFundingRound(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof addFundingRoundSchema>;
  const [row] = await db
    .insert(fundingRounds)
    .values({
      companyId: context.companyId,
      name: data.name,
      type: data.type,
      amount: String(data.amount),
      date: new Date(data.date),
      preMoneyValuation: data.preMoneyValuation ? String(data.preMoneyValuation) : null,
      dilutionPercent: data.dilutionPercent ? String(data.dilutionPercent) : null,
      isProjected: data.isProjected,
    })
    .returning();

  return JSON.stringify({
    success: true,
    fundingRoundId: row!.id,
    message: `Added ${data.name} funding round: $${data.amount.toLocaleString()} on ${data.date}.`,
  });
}

async function modelDilution(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof modelDilutionSchema>;
  const roundAmount = data.roundAmount;
  const preMoneyValuation = data.preMoneyValuation;
  const existingOwnership = data.existingOwnershipPercent;
  const optionPool = data.optionPoolPercent;

  const postMoneyValuation = preMoneyValuation + roundAmount;
  const newInvestorOwnership = roundAmount / postMoneyValuation;
  const optionPoolOwnership = optionPool;

  // After round, existing shareholders get diluted
  const founderPostRound = existingOwnership * (1 - newInvestorOwnership - optionPoolOwnership);

  // Build cap table
  const capTable = {
    preRound: {
      founders: existingOwnership,
      previousInvestors: 1.0 - existingOwnership,
    },
    postRound: {
      founders: founderPostRound,
      previousInvestors: (1.0 - existingOwnership) * (1 - newInvestorOwnership - optionPoolOwnership),
      newInvestor: newInvestorOwnership,
      optionPool: optionPoolOwnership,
    },
    dilution: {
      founderDilution: existingOwnership - founderPostRound,
      founderDilutionPercent: (existingOwnership - founderPostRound) / existingOwnership,
    },
  };

  // Model existing rounds context
  const existingRounds = data.existingRounds;

  return JSON.stringify({
    success: true,
    roundDetails: {
      roundAmount,
      preMoneyValuation,
      postMoneyValuation,
      pricePerPercent: preMoneyValuation / 100,
    },
    capTable,
    existingRounds,
    message: `Modeled dilution for $${roundAmount.toLocaleString()} round at $${preMoneyValuation.toLocaleString()} pre-money. Founders diluted from ${(existingOwnership * 100).toFixed(1)}% to ${(founderPostRound * 100).toFixed(1)}%.`,
  });
}

async function updateRevenueStream(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof updateRevenueStreamSchema>;

  const [existing] = await db
    .select({ id: revenueStreams.id, name: revenueStreams.name })
    .from(revenueStreams)
    .innerJoin(scenarios, eq(revenueStreams.scenarioId, scenarios.id))
    .where(and(eq(revenueStreams.id, data.id), eq(scenarios.companyId, context.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Revenue stream not found or access denied" });
  }

  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.type !== undefined) updates.type = data.type;
  if (data.parameters !== undefined) updates.parameters = data.parameters;

  if (Object.keys(updates).length === 0) {
    return JSON.stringify({ success: false, error: "No fields to update" });
  }

  await db.update(revenueStreams).set(updates).where(eq(revenueStreams.id, data.id));

  return JSON.stringify({
    success: true,
    message: `Updated revenue stream "${data.name ?? existing.name}".`,
  });
}

async function deleteRevenueStream(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof deleteRevenueStreamSchema>;

  const [existing] = await db
    .select({ id: revenueStreams.id, name: revenueStreams.name })
    .from(revenueStreams)
    .innerJoin(scenarios, eq(revenueStreams.scenarioId, scenarios.id))
    .where(and(eq(revenueStreams.id, data.id), eq(scenarios.companyId, context.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Revenue stream not found or access denied" });
  }

  await db.delete(revenueStreams).where(eq(revenueStreams.id, data.id));

  return JSON.stringify({
    success: true,
    message: `Deleted revenue stream "${existing.name}".`,
  });
}

async function updateFundingRound(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof updateFundingRoundSchema>;

  const [existing] = await db
    .select({ id: fundingRounds.id, name: fundingRounds.name })
    .from(fundingRounds)
    .where(and(eq(fundingRounds.id, data.id), eq(fundingRounds.companyId, context.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Funding round not found or access denied" });
  }

  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.type !== undefined) updates.type = data.type;
  if (data.amount !== undefined) updates.amount = String(data.amount);
  if (data.date !== undefined) updates.date = new Date(data.date);
  if (data.preMoneyValuation !== undefined) updates.preMoneyValuation = data.preMoneyValuation ? String(data.preMoneyValuation) : null;
  if (data.dilutionPercent !== undefined) updates.dilutionPercent = data.dilutionPercent ? String(data.dilutionPercent) : null;
  if (data.isProjected !== undefined) updates.isProjected = data.isProjected;

  if (Object.keys(updates).length === 0) {
    return JSON.stringify({ success: false, error: "No fields to update" });
  }

  await db.update(fundingRounds).set(updates).where(eq(fundingRounds.id, data.id));

  return JSON.stringify({
    success: true,
    message: `Updated funding round "${data.name ?? existing.name}".`,
  });
}

async function deleteFundingRound(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof deleteFundingRoundSchema>;

  const [existing] = await db
    .select({ id: fundingRounds.id, name: fundingRounds.name })
    .from(fundingRounds)
    .where(and(eq(fundingRounds.id, data.id), eq(fundingRounds.companyId, context.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Funding round not found or access denied" });
  }

  await db.delete(fundingRounds).where(eq(fundingRounds.id, data.id));

  return JSON.stringify({
    success: true,
    message: `Deleted funding round "${existing.name}".`,
  });
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const revenueSchemas: Record<string, z.ZodType> = {
  add_revenue_stream: addRevenueStreamSchema,
  update_revenue_stream: updateRevenueStreamSchema,
  delete_revenue_stream: deleteRevenueStreamSchema,
  add_funding_round: addFundingRoundSchema,
  update_funding_round: updateFundingRoundSchema,
  delete_funding_round: deleteFundingRoundSchema,
  model_dilution: modelDilutionSchema,
};

export const revenueHandlers: Record<string, ToolHandler> = {
  add_revenue_stream: addRevenueStream,
  update_revenue_stream: updateRevenueStream,
  delete_revenue_stream: deleteRevenueStream,
  add_funding_round: addFundingRound,
  update_funding_round: updateFundingRound,
  delete_funding_round: deleteFundingRound,
  model_dilution: modelDilution,
};
