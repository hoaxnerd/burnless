/**
 * SWR data layer — re-exports for convenient imports.
 *
 * Usage:
 *   import { useScenarios, createScenario, KEYS } from "@/lib/swr";
 */

export { SWRProvider } from "./provider";
export { KEYS } from "./keys";
export { fetcher, FetchError } from "./fetcher";
export {
  useScenarios,
  useAccounts,
  useBilling,
  useDashboardPreferences,
  useAiDashboard,
  useScenario,
} from "./hooks";
export type {
  Scenario,
  FinancialAccount,
  BillingData,
  DashboardPreferences,
} from "./hooks";
export {
  createScenario,
  updateScenario,
  deleteScenario,
  createAccount,
  updateAccount,
  deleteAccount,
  updateDashboardPreferences,
  billingAction,
} from "./mutations";
