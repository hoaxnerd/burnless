"use client";

/**
 * Typed SWR hooks for the highest-traffic data entities.
 *
 * Each hook wraps `useSWR` with the correct cache key and return type,
 * so consumers get full type safety without importing key constants.
 */

import useSWR, { type SWRConfiguration } from "swr";
import { KEYS } from "./keys";

// ── Type imports ────────────────────────────────────────────────────────────

// Re-define minimal types here to avoid circular deps with server-only modules.
// These match the JSON shapes returned by the API routes.

export interface Scenario {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  source: string;
  status: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialAccount {
  id: string;
  companyId: string;
  name: string;
  type: string;
  subtype: string | null;
  balance: number;
  currency: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BillingData {
  plan: "free" | "pro" | "team";
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  seats: number;
  usage: {
    scenarios: { used: number; limit: number };
    aiMessages: { used: number; limit: number };
    exports: { used: number; limit: number };
  };
}

export interface DashboardPreferences {
  mode: "intelligence" | "dynamic" | "custom";
  heroCards: string[];
  secondaryMetrics: string[];
  cardModeOverrides: Record<string, string>;
  cardScenarioOverrides: Record<string, string>;
  customMetrics: Array<{
    id: string;
    name: string;
    formula: string;
    dependsOn: string[];
  }>;
  layout: Array<{
    widgetId: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }>;
  hasIntelligenceCards: boolean;
}

// ── Hooks ───────────────────────────────────────────────────────────────────

/** All scenarios for the current company */
export function useScenarios(config?: SWRConfiguration<Scenario[]>) {
  return useSWR<Scenario[]>(KEYS.scenarios, { ...config });
}

/** All financial accounts for the current company */
export function useAccounts(config?: SWRConfiguration<FinancialAccount[]>) {
  return useSWR<FinancialAccount[]>(KEYS.accounts, { ...config });
}

/** Billing / subscription status */
export function useBilling(config?: SWRConfiguration<BillingData>) {
  return useSWR<BillingData>(KEYS.billing, {
    revalidateOnFocus: false, // billing doesn't change rapidly
    ...config,
  });
}

/** Dashboard layout and card preferences */
export function useDashboardPreferences(config?: SWRConfiguration<DashboardPreferences>) {
  return useSWR<DashboardPreferences>(KEYS.dashboardPreferences, { ...config });
}

/** AI cost dashboard (parameterized by day range) */
export function useAiDashboard<T = unknown>(days: number, config?: SWRConfiguration<T>) {
  return useSWR<T>(KEYS.aiDashboard(days), { ...config });
}

/** Single scenario by ID */
export function useScenario(id: string | null, config?: SWRConfiguration<Scenario>) {
  return useSWR<Scenario>(id ? KEYS.scenario(id) : null, { ...config });
}
