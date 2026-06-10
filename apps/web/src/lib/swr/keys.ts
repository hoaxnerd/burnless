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

  // Phase-2 consumer GET endpoints
  adminInviteCodes: "/api/admin/invite-codes",
  imports: "/api/imports",
  twoFactorStatus: "/api/auth/two-factor/status",
  digest: "/api/digest",
  aiPermissions: "/api/ai/permissions",
  alerts: "/api/alerts",
  integrations: "/api/integrations",
  company: "/api/company",

  // MCP connections (Connections page + AI sidebar pane)
  mcpConnections: "/api/mcp/connections",

  // Parameterized keys — call as functions
  mcpConnection: (id: string) => `/api/mcp/connections/${id}`,
  mcpConnectionTools: (id: string) => `/api/mcp/connections/${id}/tools`,
  aiDashboard: (days: number) => `/api/ai-dashboard?days=${days}`,
  scenario: (id: string) => `/api/scenarios/${id}`,
  fundingRounds: () => "/api/funding-rounds",
  departments: () => "/api/departments",
  transactions: () => "/api/transactions",
  scenarioComparison: (baseId: string, compareId: string) =>
    `/api/scenarios/compare?baseId=${baseId}&compareId=${compareId}`,
  scenarioOverrides: (scenarioId: string) =>
    `/api/scenarios/overrides?scenarioId=${scenarioId}`,
  scenarioOverrideCount: (scenarioId: string) =>
    `/api/scenarios/overrides?scenarioId=${scenarioId}&count=true`,
} as const;
