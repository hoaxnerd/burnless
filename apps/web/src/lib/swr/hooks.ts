"use client";

/**
 * Typed SWR hooks for the highest-traffic data entities.
 *
 * Each hook wraps `useSWR` with the correct cache key and return type,
 * so consumers get full type safety without importing key constants.
 */

import { useEffect } from "react";
import useSWR, { type SWRConfiguration } from "swr";
import { KEYS } from "./keys";
import { subscribeMutation, FINANCIAL_DOMAINS } from "@/lib/mutation-bus";

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
    aiCredits: { used: number; total: number; remaining: number };
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

// ── Phase-2 consumer types ───────────────────────────────────────────────────

/** A department row (used by team forms; reuse alongside useAccounts). */
export interface Department {
  id: string;
  companyId: string;
  name: string;
  parentId: string | null;
  costCenter: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A single import batch (import history — DATA-02). */
export interface ImportBatch {
  id: string;
  companyId: string;
  filename: string | null;
  status: string;
  rowCount: number | null;
  importedCount: number | null;
  createdAt: string;
  [key: string]: unknown;
}

/** Paginated payload shape returned by `paginatedResponse`. */
export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** An admin invite code with its redemptions (settings → invite-codes tab). */
export interface InviteCode {
  id: string;
  code: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  redemptions?: Array<{ id: string; userId: string; redeemedAt: string }>;
  [key: string]: unknown;
}

/** 2FA enrollment status (settings → security tab). */
export interface TwoFactorStatus {
  enabled: boolean;
}

/** Weekly digest payload for the dashboard banner. */
export interface WeeklyDigest {
  id: string;
  narrative: string | null;
  deterministicSummary: string;
  metrics: Record<string, unknown>;
  weekStart: string;
}

/** Per-user AI tool permission defaults (ai permissions panel). */
export interface AiPermissionDefaults {
  readMode: "ask" | "session" | "always";
  writeMode: "ask" | "session" | "always";
  deleteMode: "ask" | "session";
  webSearchMode: "ask" | "session" | "always";
  browserUseMode: "ask" | "session" | "always";
}

/** A proactive alert surfaced by the AI command center. */
export interface Alert {
  id: string;
  severity: string;
  title: string;
  message: string;
  [key: string]: unknown;
}

/** A connected integration row (settings page). */
export interface Integration {
  id: string;
  provider: string;
  status: string;
  [key: string]: unknown;
}

/** Company profile (settings page). */
export interface Company {
  id: string;
  name: string;
  currency: string;
  [key: string]: unknown;
}

/** Scenario override-diff summary + groups (SCN-05 change counter). */
export interface ScenarioOverridesPayload {
  summary: { modified: number; created: number; deleted: number; total: number };
  groups: Array<{ entityType: string; overrides: unknown[] }>;
}

// ── Phase-2 hooks ─────────────────────────────────────────────────────────────

/** All departments for the current company (forms). */
export function useDepartments(config?: SWRConfiguration<Department[]>) {
  return useSWR<Department[]>(KEYS.departments(), { ...config });
}

/** Import history (DATA-02). Server returns a paginated payload. */
export function useImports(config?: SWRConfiguration<Paginated<ImportBatch>>) {
  return useSWR<Paginated<ImportBatch>>(KEYS.imports, { ...config });
}

/** Admin invite codes with redemptions (settings). */
export function useInviteCodes(config?: SWRConfiguration<InviteCode[]>) {
  return useSWR<InviteCode[]>(KEYS.adminInviteCodes, { ...config });
}

/** 2FA enrollment status (settings security tab). */
export function useTwoFactorStatus(config?: SWRConfiguration<TwoFactorStatus>) {
  return useSWR<TwoFactorStatus>(KEYS.twoFactorStatus, {
    revalidateOnFocus: false,
    ...config,
  });
}

/**
 * Alias of {@link useTwoFactorStatus} for the security panel's broader naming.
 * Returns the same 2FA status payload.
 */
export function useSecurityStatus(config?: SWRConfiguration<TwoFactorStatus>) {
  return useTwoFactorStatus(config);
}

/** Weekly digest for the banner. The route wraps it as `{ digest }`. */
export function useWeeklyDigest(
  config?: SWRConfiguration<{ digest: WeeklyDigest | null }>,
) {
  return useSWR<{ digest: WeeklyDigest | null }>(KEYS.digest, { ...config });
}

/** Per-user AI tool permission defaults. Route wraps as `{ defaults }`. */
export function useAiPermissions(
  config?: SWRConfiguration<{ defaults: AiPermissionDefaults }>,
) {
  return useSWR<{ defaults: AiPermissionDefaults }>(KEYS.aiPermissions, { ...config });
}

/** Proactive AI alerts (dashboard command center). Route wraps as `{ alerts }`. */
export function useAlerts(config?: SWRConfiguration<{ alerts: Alert[] }>) {
  return useSWR<{ alerts: Alert[] }>(KEYS.alerts, { ...config });
}

/** Connected integrations (settings page). */
export function useIntegrations(config?: SWRConfiguration<Integration[]>) {
  return useSWR<Integration[]>(KEYS.integrations, { ...config });
}

/** Company profile (settings page). */
export function useCompany(config?: SWRConfiguration<Company>) {
  return useSWR<Company>(KEYS.company, { ...config });
}

/**
 * Scenario A/B comparison (scenarios/compare). The payload shape lives in the
 * consumer (`comparison-types`), so this hook is generic — pass `ComparisonData`
 * at the call site: `useScenarioComparison<ComparisonData>(baseId, compareId)`.
 */
export function useScenarioComparison<T = unknown>(
  baseId: string | null,
  compareId: string | null,
  config?: SWRConfiguration<T>,
) {
  return useSWR<T>(
    baseId && compareId ? KEYS.scenarioComparison(baseId, compareId) : null,
    { ...config },
  );
}

/** Full scenario override list + summary for a scenario (SCN-05). */
export function useScenarioOverrides(
  scenarioId: string | null,
  config?: SWRConfiguration<ScenarioOverridesPayload>,
) {
  return useSWR<ScenarioOverridesPayload>(
    scenarioId ? KEYS.scenarioOverrides(scenarioId) : null,
    { ...config },
  );
}

/**
 * Override count only (SCN-05 change counter). Uses the route's `?count=true`
 * fast path so the badge doesn't pull the full override list.
 */
export function useOverrideCount(
  scenarioId: string | null,
  config?: SWRConfiguration<{ count: number }>,
) {
  const swr = useSWR<{ count: number }>(
    scenarioId ? KEYS.scenarioOverrideCount(scenarioId) : null,
    { ...config },
  );
  // SCN-05: the scenario-head change counter must update the instant a
  // scenario-aware edit lands — not only on focus/reload. Editing an expense /
  // headcount / revenue / funding row in scenario mode writes an override, and
  // apiFetch publishes a financial MutationEvent; revalidate the count on it
  // (same-tab AND cross-tab). No-op when no scenario is active (key is null).
  const { mutate } = swr;
  useEffect(() => {
    if (!scenarioId) return;
    return subscribeMutation((e) => {
      if (FINANCIAL_DOMAINS.has(e.domain)) void mutate();
    });
  }, [scenarioId, mutate]);
  return swr;
}
