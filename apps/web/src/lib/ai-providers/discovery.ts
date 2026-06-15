/**
 * Model discovery (P2 / spec §4). GET {baseUrl}/v1/models for OpenAI-shaped
 * providers; catalog knownModels fallback for kinds that don't expose it.
 * No DB writes — the route upserts the returned descriptors.
 */
import { getCatalogEntry, type ProviderKind } from "@burnless/ai";

export interface DiscoveredModel {
  modelId: string;
  source: "fetched" | "preset";
}

/**
 * Discovery failure carrying a user-safe message. `authRequired` is set when the
 * endpoint rejected the (missing/invalid) key — the UI can prompt for a key.
 */
export class ModelDiscoveryError extends Error {
  authRequired: boolean;
  status?: number;
  constructor(message: string, opts?: { authRequired?: boolean; status?: number }) {
    super(message);
    this.name = "ModelDiscoveryError";
    this.authRequired = opts?.authRequired ?? false;
    this.status = opts?.status;
  }
}

/**
 * Canonical hosted base URLs for discovery-capable kinds that have NO
 * `defaultBaseUrl` in the catalog (the catalog omits it because the underlying
 * provider SDK already knows the host). Custom kinds (e.g. openai-compatible)
 * are intentionally absent — they must supply an explicit base URL.
 */
const FALLBACK_BASE_URL: Partial<Record<ProviderKind, string>> = {
  openai: "https://api.openai.com/v1",
};

export async function fetchProviderModels(input: {
  kind: ProviderKind;
  baseUrl?: string | null;
  apiKey?: string | null;
  headers?: Record<string, string> | null;
}): Promise<DiscoveredModel[]> {
  const entry = getCatalogEntry(input.kind);

  // Kinds without OpenAI-shaped discovery → catalog knownModels.
  if (!entry?.supportsModelDiscovery) {
    return (entry?.knownModels ?? []).map((modelId) => ({ modelId, source: "preset" as const }));
  }

  const base = (input.baseUrl ?? entry.defaultBaseUrl ?? FALLBACK_BASE_URL[input.kind] ?? "").replace(/\/+$/, "");
  if (!base) {
    throw new ModelDiscoveryError(
      "Enter a base URL for this provider before fetching its models.",
    );
  }

  const headers: Record<string, string> = { ...(input.headers ?? {}) };
  if (input.apiKey) headers.Authorization = `Bearer ${input.apiKey}`;

  let res: Response;
  try {
    res = await fetch(`${base}/models`, { headers });
  } catch {
    throw new ModelDiscoveryError(
      "Could not reach the provider's endpoint. Check the base URL and your network.",
    );
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new ModelDiscoveryError(
        input.apiKey
          ? "The provider rejected the API key. Check the key and try again."
          : "This provider requires an API key to list its models. Enter a key and try again.",
        { authRequired: true, status: res.status },
      );
    }
    throw new ModelDiscoveryError(
      `Could not fetch models from the provider (HTTP ${res.status}).`,
      { status: res.status },
    );
  }
  const body = (await res.json()) as { data?: Array<{ id?: string }> };
  const ids = (body.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  return ids.map((modelId) => ({ modelId, source: "fetched" as const }));
}
