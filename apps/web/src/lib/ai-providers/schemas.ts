import { z } from "zod";
import { listCatalogKinds } from "@burnless/ai";

const kindEnum = z.enum(listCatalogKinds() as [string, ...string[]]);

export const createProviderSchema = z.object({
  name: z.string().min(1).max(120),
  kind: kindEnum,
  baseUrl: z.string().url().max(512).optional(),
  apiKey: z.string().min(1).max(512).optional(),
  apiKeyMode: z.enum(["managed", "user_provided", "none"]).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  dropParams: z.record(z.string(), z.unknown()).optional(),
});

export const updateProviderSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  baseUrl: z.string().url().max(512).nullable().optional(),
  apiKey: z.string().min(1).max(512).nullable().optional(),
  apiKeyMode: z.enum(["managed", "user_provided", "none"]).optional(),
  headers: z.record(z.string(), z.string()).nullable().optional(),
  dropParams: z.record(z.string(), z.unknown()).nullable().optional(),
  enabled: z.boolean().optional(),
});

export const addModelSchema = z.object({
  modelId: z.string().min(1).max(200),
  displayName: z.string().max(200).optional(),
  contextWindow: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  supportsTools: z.boolean().optional(),
  supportsImages: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});
