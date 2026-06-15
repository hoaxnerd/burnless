"use client";

/**
 * SWR mutation helpers with optimistic updates.
 *
 * Each helper wraps a POST/PATCH/DELETE call, performs an optimistic
 * cache update, and rolls back on failure. Works with `useSWRMutation`
 * or can be called directly alongside `mutate()`.
 */

import { mutate } from "swr";
import { apiFetch } from "@/lib/api-fetch";
import {
  subscribeMutation,
  type MutationEvent,
  FINANCIAL_DOMAINS,
} from "@/lib/mutation-bus";
import { KEYS } from "./keys";
import { FetchError } from "./fetcher";
import type { AiProviderPublic, AiProviderModelRow } from "@burnless/db";
import type { ProviderKind } from "@burnless/ai";

// ── Post-mutation revalidation (PMR-1) ───────────────────────────────────────

/**
 * Single trigger any consumer can call after a successful mutation to revalidate
 * one or more SWR keys. Thin wrapper over `mutate` so Phase-2 consumers import
 * from one place (`@/lib/swr`) instead of reaching into `swr` directly.
 *
 *   import { revalidate, KEYS } from "@/lib/swr";
 *   await save(); revalidate(KEYS.imports);
 */
export async function revalidate(...keys: string[]): Promise<void> {
  await Promise.all(keys.map((k) => mutate(k)));
}

/**
 * Subscribe to the financial mutation bus and revalidate the given SWR keys
 * whenever a *financial-domain* mutation fires (same-tab or cross-tab).
 *
 * Preserves the bus's "other" domain exclusion: `domainFromUrl` already maps
 * non-financial endpoints (preferences, the insights-regen POST itself, chat,
 * ai-config) to "other", which `apiFetch` never publishes — and we additionally
 * guard on `FINANCIAL_DOMAINS` here so a future non-financial emitter can't
 * retrigger a revalidation loop. Returns an unsubscribe fn for cleanup in an
 * effect.
 */
export function revalidateOnFinancialMutation(
  keys: string[],
  onEvent?: (e: MutationEvent) => void,
): () => void {
  return subscribeMutation((e) => {
    if (!FINANCIAL_DOMAINS.has(e.domain)) return; // exclude "other"
    void Promise.all(keys.map((k) => mutate(k)));
    onEvent?.(e);
  });
}

// ── Generic helpers ─────────────────────────────────────────────────────────

async function apiCall<T = unknown>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await apiFetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new FetchError(data.error || `Request failed (${res.status})`, res.status, data);
  }

  // DELETE may return 204 with no body
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Scenario mutations ──────────────────────────────────────────────────────

export async function createScenario(data: { name: string; description?: string }) {
  const result = await apiCall(KEYS.scenarios, "POST", data);
  await mutate(KEYS.scenarios); // revalidate the list
  return result;
}

export async function updateScenario(
  id: string,
  data: Partial<{ name: string; description: string; color: string | null; status: string }>,
) {
  const result = await apiCall(KEYS.scenario(id), "PATCH", data);
  // Revalidate both the single scenario and the list
  await Promise.all([mutate(KEYS.scenario(id)), mutate(KEYS.scenarios)]);
  return result;
}

export async function deleteScenario(id: string) {
  await apiCall(KEYS.scenario(id), "DELETE");
  await mutate(KEYS.scenarios);
}

// ── Account mutations ───────────────────────────────────────────────────────

export async function createAccount(data: {
  name: string;
  type: string;
  subtype?: string;
  balance?: number;
  currency?: string;
}) {
  const result = await apiCall(KEYS.accounts, "POST", data);
  await mutate(KEYS.accounts);
  return result;
}

export async function updateAccount(
  id: string,
  data: Partial<{ name: string; type: string; balance: number; isActive: boolean; sortOrder: number }>,
) {
  const result = await apiCall(`/api/accounts/${id}`, "PATCH", data);
  await mutate(KEYS.accounts);
  return result;
}

export async function deleteAccount(id: string) {
  await apiCall(`/api/accounts/${id}`, "DELETE");
  await mutate(KEYS.accounts);
}

// ── Dashboard preferences mutations ─────────────────────────────────────────

export async function updateDashboardPreferences(
  data: Partial<{
    mode: string;
    heroCards: string[];
    secondaryMetrics: string[];
    cardModeOverrides: Record<string, string>;
    cardScenarioOverrides: Record<string, string>;
    layout: Array<{ widgetId: string; x: number; y: number; w: number; h: number }>;
    customMetrics: Array<{ id: string; name: string; formula: string; dependsOn: string[] }>;
  }>,
) {
  const result = await apiCall(KEYS.dashboardPreferences, "PATCH", data);
  await mutate(KEYS.dashboardPreferences);
  return result;
}

// ── Billing mutations ───────────────────────────────────────────────────────

export async function billingAction(
  action: "checkout" | "portal" | "cancel" | "reactivate",
  extra?: Record<string, unknown>,
): Promise<{ url?: string; cancelAtPeriodEnd?: boolean }> {
  const result = await apiCall<{ url?: string; cancelAtPeriodEnd?: boolean }>(
    KEYS.billing,
    "POST",
    { action, ...extra },
  );
  if (action === "cancel" || action === "reactivate") {
    await mutate(KEYS.billing);
  }
  return result;
}

// ── AI provider mutations (Settings → AI Providers, #49 P3) ──────────────────

export async function createAiProvider(data: {
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  apiKey?: string;
  apiKeyMode?: "managed" | "user_provided" | "none";
  headers?: Record<string, string>;
  dropParams?: Record<string, unknown>;
}): Promise<{ provider: AiProviderPublic }> {
  const r = await apiCall<{ provider: AiProviderPublic }>(KEYS.aiProviders, "POST", data);
  await mutate(KEYS.aiProviders);
  return r;
}

export async function updateAiProvider(
  id: string,
  data: Record<string, unknown>,
): Promise<{ provider: AiProviderPublic }> {
  const r = await apiCall<{ provider: AiProviderPublic }>(KEYS.aiProvider(id), "PATCH", data);
  await Promise.all([mutate(KEYS.aiProviders), mutate(KEYS.aiProviderModels(id))]);
  return r;
}

export async function deleteAiProvider(id: string): Promise<void> {
  await apiCall(KEYS.aiProvider(id), "DELETE");
  await mutate(KEYS.aiProviders);
}

export async function setDefaultAiProvider(id: string): Promise<void> {
  await apiCall(`${KEYS.aiProvider(id)}/default`, "POST");
  await mutate(KEYS.aiProviders);
}

/**
 * Test a provider's credentials. Uses `apiFetch` directly (not `apiCall`) so an
 * `ok: false` 400 from a bad key returns the parsed `{ ok, error }` payload
 * instead of throwing — the UI surfaces the error inline.
 */
export async function testAiProvider(
  id: string,
): Promise<{ ok: boolean; model?: string; response?: string; error?: string }> {
  const res = await apiFetch(`${KEYS.aiProvider(id)}/test`, { method: "POST" });
  return res.json();
}

export async function fetchAiProviderModels(
  id: string,
): Promise<{ models: AiProviderModelRow[]; fetched: number }> {
  const r = await apiCall<{ models: AiProviderModelRow[]; fetched: number }>(
    `${KEYS.aiProviderModels(id)}/fetch`,
    "POST",
  );
  await mutate(KEYS.aiProviderModels(id));
  return r;
}

/**
 * Pre-save model discovery — fetch the available models for an as-yet-unsaved
 * provider directly from {kind, baseUrl?, apiKey?}. Keyless providers
 * (OpenRouter/Ollama) work with no apiKey. Used by the modal's Fetch button in
 * create-mode. Returns model descriptors (no DB rows yet); on failure throws a
 * FetchError carrying the route's user-safe message (route through toUserMessage).
 */
export async function discoverAiProviderModels(input: {
  kind: ProviderKind;
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
}): Promise<{ models: Array<{ modelId: string; source: "fetched" | "preset" }>; fetched: number }> {
  return apiCall(KEYS.aiProviderDiscoverModels, "POST", input);
}

export async function addAiProviderModel(
  id: string,
  data: { modelId: string; isDefault?: boolean },
): Promise<{ model: AiProviderModelRow }> {
  const r = await apiCall<{ model: AiProviderModelRow }>(KEYS.aiProviderModels(id), "POST", data);
  await Promise.all([mutate(KEYS.aiProviderModels(id)), mutate(KEYS.aiProviders)]);
  return r;
}

/**
 * No dedicated set-default-model route in P2 — the manual-add route accepts
 * `isDefault` and upserts (preserving source). Re-POST with `isDefault: true`
 * to promote an existing model.
 */
export async function setDefaultAiProviderModel(
  id: string,
  modelId: string,
): Promise<{ model: AiProviderModelRow }> {
  const r = await apiCall<{ model: AiProviderModelRow }>(KEYS.aiProviderModels(id), "POST", {
    modelId,
    isDefault: true,
  });
  await Promise.all([mutate(KEYS.aiProviderModels(id)), mutate(KEYS.aiProviders)]);
  return r;
}
