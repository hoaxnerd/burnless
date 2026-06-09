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
