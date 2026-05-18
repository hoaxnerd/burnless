import { z } from "zod";

const RoundTypeBaseSchema = z.enum([
  "pre_seed", "seed", "series_a", "series_b", "series_c_plus",
  "safe", "convertible", "debt", "grant",
]);

const EquityParamsSchema = z.object({
  shareClassId: z.string().optional(),
  sharesIssued: z.number().nonnegative().optional(),
  pricePerShare: z.number().nonnegative().optional(),
  liquidationPreference: z.number().min(0).max(10).optional(),
}).strict();

const SafeParamsSchema = z.object({
  valuationCap: z.number().positive().optional(),
  discountRate: z.number().min(0).max(0.5).optional(),
  mfn: z.boolean().optional(),
  proRata: z.boolean().optional(),
}).strict();

const ConvertibleParamsSchema = z.object({
  valuationCap: z.number().positive().optional(),
  discountRate: z.number().min(0).max(0.5).optional(),
  interestRate: z.number().min(0).max(0.5).optional(),
  maturityDate: z.string().optional(),
  conversionThreshold: z.number().nonnegative().optional(),
}).strict();

const DebtParamsSchema = z.object({
  interestRate: z.number().min(0).max(1),
  termMonths: z.number().int().positive(),
  repaymentSchedule: z.enum(["straight_line", "amortized", "interest_only"]).optional(),
  firstPaymentDate: z.string().optional(),
}).strict();

const GrantMilestoneSchema = z.object({
  id: z.string(),
  label: z.string(),
  amount: z.number().nonnegative(),
  dueDate: z.string(),
  hitDate: z.string().optional(),
}).strict();

const GrantParamsSchema = z.object({
  milestones: z.array(GrantMilestoneSchema),
  matchRequirement: z
    .object({ requiredAmount: z.number().nonnegative(), asOf: z.string() })
    .strict()
    .optional(),
}).strict();

export const ParametersSchema = z.union([
  EquityParamsSchema,
  SafeParamsSchema,
  ConvertibleParamsSchema,
  DebtParamsSchema,
  GrantParamsSchema,
]);

/** Phase 2 D §1.5: `create_funding_round` is the ONLY path that sets `roundType`. */
export const CreateFundingRoundSchema = z.object({
  name: z.string().min(1),
  roundType: RoundTypeBaseSchema,
  amount: z.number().positive(),
  date: z.string(),
  closeDate: z.string().optional(),
  preMoneyValuation: z.number().nonnegative().optional(),
  dilutionPercent: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  parameters: ParametersSchema.optional(),
  isProjected: z.boolean().optional(),
}).strict();

/**
 * Phase 2 D §1.5 D2: `roundType` and `type` OMITTED. Immutability enforced at three layers
 * (Zod here + API route strip in update PATCH + scenario-mutations belt-and-suspenders).
 */
export const UpdateFundingRoundSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  date: z.string().optional(),
  closeDate: z.string().nullable().optional(),
  preMoneyValuation: z.number().nonnegative().nullable().optional(),
  dilutionPercent: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().nullable().optional(),
  parameters: ParametersSchema.optional(),
  isProjected: z.boolean().optional(),
}).strict();

export const DeleteFundingRoundSchema = z.object({ id: z.string() }).strict();

export const AddFundingRoundInvestorSchema = z.object({
  fundingRoundId: z.string(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  amountInvested: z.number().positive(),
}).strict();

export const MarkGrantMilestoneHitSchema = z.object({
  fundingRoundId: z.string(),
  milestoneId: z.string(),
  hitDate: z.string(),
}).strict();

export const ModelDilutionSchema = z.object({
  roundAmount: z.number().positive(),
  preMoneyValuation: z.number().positive(),
  existingOwnershipPercent: z.number().min(0).max(100),
  optionPoolPercent: z.number().min(0).max(100).optional(),
  existingRounds: z.array(z.unknown()).optional(),
}).strict();

export type CreateFundingRound = z.infer<typeof CreateFundingRoundSchema>;
export type UpdateFundingRound = z.infer<typeof UpdateFundingRoundSchema>;
export type DeleteFundingRound = z.infer<typeof DeleteFundingRoundSchema>;
export type AddFundingRoundInvestor = z.infer<typeof AddFundingRoundInvestorSchema>;
export type MarkGrantMilestoneHit = z.infer<typeof MarkGrantMilestoneHitSchema>;
