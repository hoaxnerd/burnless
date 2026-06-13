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
  // Phase-2 hooks
  useDepartments,
  useImports,
  useInviteCodes,
  useTwoFactorStatus,
  useSecurityStatus,
  useWeeklyDigest,
  useAiPermissions,
  useAlerts,
  useIntegrations,
  useCompany,
  useScenarioComparison,
  useScenarioOverrides,
  useOverrideCount,
  useNotifications,
  // AI providers manager (#49 P3)
  useAiProviders,
  useAiProviderModels,
} from "./hooks";
export type {
  Scenario,
  FinancialAccount,
  BillingData,
  DashboardPreferences,
  // Phase-2 types
  Department,
  ImportBatch,
  Paginated,
  InviteCode,
  TwoFactorStatus,
  WeeklyDigest,
  AiPermissionDefaults,
  Alert,
  Integration,
  Company,
  ScenarioOverridesPayload,
  NotificationDto,
  NotificationsResponse,
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
  // Post-mutation revalidation (PMR-1)
  revalidate,
  revalidateOnFinancialMutation,
  // AI provider mutations (#49 P3)
  createAiProvider,
  updateAiProvider,
  deleteAiProvider,
  setDefaultAiProvider,
  testAiProvider,
  fetchAiProviderModels,
  addAiProviderModel,
  setDefaultAiProviderModel,
} from "./mutations";
