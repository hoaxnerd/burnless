import { z } from "zod";
import { listCatalogKinds } from "@burnless/ai";

const kindEnum = z.enum(listCatalogKinds() as [string, ...string[]]);

export const createProviderSchema = z.object({
  name: z.string().min(1).max(120),
  kind: kindEnum,
  baseUrl: z.string().url().max(512).optional(),
  apiKey: z.string().min(1).max(512).optional(),
  apiKeyMode: z.enum(["managed", "user_provided", "none"]).optional(),
  headers: z.record(z.string().max(128), z.string().max(1024)).refine((v) => Object.keys(v).length <= 20, "max 20 custom headers").optional(),
  dropParams: z.record(z.string().max(128), z.unknown()).refine((v) => Object.keys(v).length <= 30, "max 30 dropParams").optional(),
});

export const updateProviderSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  baseUrl: z.string().url().max(512).nullable().optional(),
  apiKey: z.string().min(1).max(512).nullable().optional(),
  apiKeyMode: z.enum(["managed", "user_provided", "none"]).optional(),
  headers: z.record(z.string().max(128), z.string().max(1024)).refine((v) => Object.keys(v).length <= 20, "max 20 custom headers").nullable().optional(),
  dropParams: z.record(z.string().max(128), z.unknown()).refine((v) => Object.keys(v).length <= 30, "max 30 dropParams").nullable().optional(),
  enabled: z.boolean().optional(),
});

/**
 * Pre-save model discovery (no provider id yet). Mirrors the create form: the
 * modal sends the currently-entered {kind, baseUrl?, apiKey?} so the Fetch button
 * works before the provider is saved. Keyless providers (OpenRouter/Ollama) work
 * with no apiKey; key-required ones return a friendly error when none is given.
 */
export const discoverModelsSchema = z.object({
  kind: kindEnum,
  baseUrl: z.string().url().max(512).optional(),
  apiKey: z.string().min(1).max(512).optional(),
  headers: z.record(z.string().max(128), z.string().max(1024)).refine((v) => Object.keys(v).length <= 20, "max 20 custom headers").optional(),
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
