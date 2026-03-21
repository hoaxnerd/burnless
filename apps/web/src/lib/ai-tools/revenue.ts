/**
 * Revenue modeling, funding rounds, and dilution tools.
 */

import { db } from "@burnless/db";
import { revenueStreams, fundingRounds } from "@burnless/db";
import { z } from "zod";
import type { ToolContext, ToolHandler } from "./types";
import {
  nameString,
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

// ── Registry ─────────────────────────────────────────────────────────────────

export const revenueSchemas: Record<string, z.ZodType> = {
  add_revenue_stream: addRevenueStreamSchema,
  add_funding_round: addFundingRoundSchema,
  model_dilution: modelDilutionSchema,
};

export const revenueHandlers: Record<string, ToolHandler> = {
  add_revenue_stream: addRevenueStream,
  add_funding_round: addFundingRound,
  model_dilution: modelDilution,
};
