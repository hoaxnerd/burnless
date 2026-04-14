/**
 * Centralized SWR cache key constants.
 *
 * Using constants (instead of inline strings) means:
 * - Mutations can invalidate the right keys via `mutate(KEYS.scenarios)`
 * - Typos are caught at compile time
 * - Easy to grep for all consumers of a given cache entry
 */

export const KEYS = {
  scenarios: "/api/scenarios",
  accounts: "/api/accounts",
  billing: "/api/billing",
  dashboardPreferences: "/api/dashboard-preferences",
  team: "/api/team",
  inviteCodes: "/api/invite-codes",

  // Parameterized keys — call as functions
  aiDashboard: (days: number) => `/api/ai-dashboard?days=${days}`,
  scenario: (id: string) => `/api/scenarios/${id}`,
  fundingRounds: () => "/api/funding-rounds",
  departments: () => "/api/departments",
  transactions: () => "/api/transactions",
} as const;
