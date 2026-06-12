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

  // MCP expose (Your MCP tab)
  apiTokens: "/api/tokens",
  oauthGrants: "/api/oauth/grants",

  // Per-user UI preferences (AI sidebar D11 kill-switch reads/writes this)
  userPreferences: "/api/user-preferences",

  notifications: "/api/notifications",

  // Browser-use availability (AI Tools pane — built-in browser row)
  browserAvailability: "/api/browser/availability",

  // Scheduled automations (Automations page + chat-create proposal card)
  automations: "/api/automations",

  // Parameterized keys — call as functions
  automation: (id: string) => `/api/automations/${id}`,
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

  // Per-conversation session-disabled tool map (AI Tools pane reads on load)
  sessionDisabledTools: (conversationId: string) =>
    `/api/chat/session-tools?conversationId=${conversationId}`,
} as const;
