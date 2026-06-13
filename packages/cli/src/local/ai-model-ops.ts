/**
 * Local AI-model ops — direct over the P2 query layer. Models are provider-scoped + the
 * default-model setter keys off the model ROW id, so name/modelId are resolved to the row.
 */
import {
  type AiProviderModelRow,
  addAiProviderModel,
  closeDatabase,
  initDatabase,
  isDatabaseBooted,
  listAiProviderModels,
  setDefaultAiProviderModel,
} from "@burnless/db";
import { UsageError } from "../errors";
import { resolveProviderId } from "./ai-provider-ops";

async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  const owned = !isDatabaseBooted();
  await initDatabase();
  try {
    return await fn();
  } finally {
    if (owned) await closeDatabase();
  }
}

export async function mList(providerName: string): Promise<AiProviderModelRow[]> {
  return withDb(async () => {
    const { id } = await resolveProviderId(providerName);
    return listAiProviderModels(id);
  });
}

export async function mAdd(providerName: string, modelId: string): Promise<AiProviderModelRow> {
  return withDb(async () => {
    const { id } = await resolveProviderId(providerName);
    return addAiProviderModel(id, { modelId, source: "manual" });
  });
}

export async function mDefault(providerName: string, modelId: string): Promise<void> {
  await withDb(async () => {
    const { id: providerId } = await resolveProviderId(providerName);
    const row = (await listAiProviderModels(providerId)).find((m) => m.modelId === modelId);
    if (!row) throw new UsageError(`Provider "${providerName}" has no model "${modelId}". Add it with \`burnless model add\`.`);
    await setDefaultAiProviderModel(row.id, providerId);
  });
}
