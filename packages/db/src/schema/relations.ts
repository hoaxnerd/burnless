import { relations } from "drizzle-orm";
import { users, oauthClients } from "./auth";
import {
  companies,
  companyMembers,
  departments,
  inviteCodes,
  inviteCodeRedemptions,
  oauthAuthCodes,
  oauthTokens,
  apiTokens,
} from "./tenant";
import {
  integrations,
  mcpConnections,
  mcpCredentials,
  mcpToolPrefs,
} from "./integrations";
import {
  aiFeatureFlags,
  aiProviders,
  aiProviderModels,
  aiConversations,
  insightInvalidations,
  aiInsightCache,
  aiTurnEvents,
  aiPermissionDefaults,
  aiUsageLogs,
  aiToolAuditLogs,
} from "./ai";
import {
  dashboardPreferences,
  userPreferences,
  weeklyDigests,
  scheduledJobs,
  scheduledJobRuns,
  exportLogs,
  notifications,
  privacyConsents,
} from "./platform";
import {
  financialAccounts,
  transactions,
  importBatches,
  merchantCategoryMappings,
  scenarios,
  scenarioOverrides,
  forecastLines,
  forecastValues,
  headcountPlans,
  equityGrants,
  bonuses,
  salaryChanges,
  revenueStreams,
  fundingRounds,
  fundingRoundInvestors,
  shareClasses,
  optionPools,
  metrics,
  financialAuditLogs,
} from "./finance";
import { memory } from "./memory";

// ── Relations ─────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  companyMemberships: many(companyMembers),
  ownedCompanies: many(companies),
  dashboardPreferences: many(dashboardPreferences),
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  owner: one(users, {
    fields: [companies.ownerId],
    references: [users.id],
  }),
  members: many(companyMembers),
  financialAccounts: many(financialAccounts),
  transactions: many(transactions),
  scenarios: many(scenarios),
  forecastLines: many(forecastLines),
  headcountPlans: many(headcountPlans),
  revenueStreams: many(revenueStreams),
  departments: many(departments),
  fundingRounds: many(fundingRounds),
  metrics: many(metrics),
  integrations: many(integrations),
  importBatches: many(importBatches),
  aiFeatureFlags: many(aiFeatureFlags),
  aiProviders: many(aiProviders),
  aiConversations: many(aiConversations),
  aiInsightCache: many(aiInsightCache),
  weeklyDigests: many(weeklyDigests),
  financialAuditLogs: many(financialAuditLogs),
  dashboardPreferences: many(dashboardPreferences),
  mcpConnections: many(mcpConnections),
}));

export const dashboardPreferencesRelations = relations(dashboardPreferences, ({ one }) => ({
  user: one(users, {
    fields: [dashboardPreferences.userId],
    references: [users.id],
  }),
  company: one(companies, {
    fields: [dashboardPreferences.companyId],
    references: [companies.id],
  }),
}));

export const companyMembersRelations = relations(companyMembers, ({ one }) => ({
  company: one(companies, {
    fields: [companyMembers.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [companyMembers.userId],
    references: [users.id],
  }),
}));

export const financialAccountsRelations = relations(
  financialAccounts,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [financialAccounts.companyId],
      references: [companies.id],
    }),
    parent: one(financialAccounts, {
      fields: [financialAccounts.parentId],
      references: [financialAccounts.id],
    }),
    transactions: many(transactions),
    forecastLines: many(forecastLines),
  })
);

export const transactionsRelations = relations(transactions, ({ one }) => ({
  company: one(companies, {
    fields: [transactions.companyId],
    references: [companies.id],
  }),
  account: one(financialAccounts, {
    fields: [transactions.accountId],
    references: [financialAccounts.id],
  }),
  importBatch: one(importBatches, {
    fields: [transactions.importBatchId],
    references: [importBatches.id],
  }),
}));

export const importBatchesRelations = relations(
  importBatches,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [importBatches.companyId],
      references: [companies.id],
    }),
    account: one(financialAccounts, {
      fields: [importBatches.accountId],
      references: [financialAccounts.id],
    }),
    transactions: many(transactions),
  })
);

export const scenariosRelations = relations(scenarios, ({ one, many }) => ({
  company: one(companies, {
    fields: [scenarios.companyId],
    references: [companies.id],
  }),
  overrides: many(scenarioOverrides),
}));

export const scenarioOverridesRelations = relations(scenarioOverrides, ({ one }) => ({
  scenario: one(scenarios, {
    fields: [scenarioOverrides.scenarioId],
    references: [scenarios.id],
  }),
}));

export const forecastLinesRelations = relations(
  forecastLines,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [forecastLines.companyId],
      references: [companies.id],
    }),
    account: one(financialAccounts, {
      fields: [forecastLines.accountId],
      references: [financialAccounts.id],
    }),
    values: many(forecastValues),
  })
);

export const forecastValuesRelations = relations(forecastValues, ({ one }) => ({
  forecastLine: one(forecastLines, {
    fields: [forecastValues.forecastLineId],
    references: [forecastLines.id],
  }),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  company: one(companies, {
    fields: [departments.companyId],
    references: [companies.id],
  }),
  headcountPlans: many(headcountPlans),
}));

export const headcountPlansRelations = relations(headcountPlans, ({ one, many }) => ({
  company: one(companies, {
    fields: [headcountPlans.companyId],
    references: [companies.id],
  }),
  department: one(departments, {
    fields: [headcountPlans.departmentId],
    references: [departments.id],
  }),
  salaryChanges: many(salaryChanges),
  bonuses: many(bonuses),
  equityGrants: many(equityGrants),
}));

export const salaryChangesRelations = relations(salaryChanges, ({ one }) => ({
  company: one(companies, {
    fields: [salaryChanges.companyId],
    references: [companies.id],
  }),
  headcount: one(headcountPlans, {
    fields: [salaryChanges.headcountId],
    references: [headcountPlans.id],
  }),
}));

export const bonusesRelations = relations(bonuses, ({ one }) => ({
  company: one(companies, {
    fields: [bonuses.companyId],
    references: [companies.id],
  }),
  headcount: one(headcountPlans, {
    fields: [bonuses.headcountId],
    references: [headcountPlans.id],
  }),
}));

export const equityGrantsRelations = relations(equityGrants, ({ one }) => ({
  company: one(companies, {
    fields: [equityGrants.companyId],
    references: [companies.id],
  }),
  headcount: one(headcountPlans, {
    fields: [equityGrants.headcountId],
    references: [headcountPlans.id],
  }),
}));

export const revenueStreamsRelations = relations(revenueStreams, ({ one }) => ({
  company: one(companies, {
    fields: [revenueStreams.companyId],
    references: [companies.id],
  }),
}));

export const fundingRoundsRelations = relations(fundingRounds, ({ one, many }) => ({
  company: one(companies, { fields: [fundingRounds.companyId], references: [companies.id] }),
  investors: many(fundingRoundInvestors),
}));

export const fundingRoundInvestorsRelations = relations(fundingRoundInvestors, ({ one }) => ({
  round: one(fundingRounds, {
    fields: [fundingRoundInvestors.fundingRoundId],
    references: [fundingRounds.id],
  }),
}));

export const shareClassesRelations = relations(shareClasses, ({ one }) => ({
  company: one(companies, { fields: [shareClasses.companyId], references: [companies.id] }),
}));

export const optionPoolsRelations = relations(optionPools, ({ one }) => ({
  company: one(companies, { fields: [optionPools.companyId], references: [companies.id] }),
}));

export const metricsRelations = relations(metrics, ({ one }) => ({
  company: one(companies, {
    fields: [metrics.companyId],
    references: [companies.id],
  }),
}));

export const integrationsRelations = relations(integrations, ({ one }) => ({
  company: one(companies, {
    fields: [integrations.companyId],
    references: [companies.id],
  }),
}));

export const aiFeatureFlagsRelations = relations(aiFeatureFlags, ({ one }) => ({
  company: one(companies, {
    fields: [aiFeatureFlags.companyId],
    references: [companies.id],
  }),
}));

export const aiProvidersRelations = relations(aiProviders, ({ one, many }) => ({
  company: one(companies, { fields: [aiProviders.companyId], references: [companies.id] }),
  models: many(aiProviderModels),
}));
export const aiProviderModelsRelations = relations(aiProviderModels, ({ one }) => ({
  provider: one(aiProviders, { fields: [aiProviderModels.providerId], references: [aiProviders.id] }),
}));

export const aiConversationsRelations = relations(
  aiConversations,
  ({ one }) => ({
    company: one(companies, {
      fields: [aiConversations.companyId],
      references: [companies.id],
    }),
    user: one(users, {
      fields: [aiConversations.userId],
      references: [users.id],
    }),
  })
);

export const aiInsightCacheRelations = relations(aiInsightCache, ({ one }) => ({
  company: one(companies, {
    fields: [aiInsightCache.companyId],
    references: [companies.id],
  }),
}));

export const weeklyDigestsRelations = relations(weeklyDigests, ({ one }) => ({
  company: one(companies, {
    fields: [weeklyDigests.companyId],
    references: [companies.id],
  }),
}));

export const privacyConsentsRelations = relations(
  privacyConsents,
  ({ one }) => ({
    user: one(users, {
      fields: [privacyConsents.userId],
      references: [users.id],
    }),
  })
);

export const merchantCategoryMappingsRelations = relations(
  merchantCategoryMappings,
  ({ one }) => ({
    company: one(companies, {
      fields: [merchantCategoryMappings.companyId],
      references: [companies.id],
    }),
    account: one(financialAccounts, {
      fields: [merchantCategoryMappings.accountId],
      references: [financialAccounts.id],
    }),
  })
);

export const financialAuditLogsRelations = relations(
  financialAuditLogs,
  ({ one }) => ({
    company: one(companies, {
      fields: [financialAuditLogs.companyId],
      references: [companies.id],
    }),
    user: one(users, {
      fields: [financialAuditLogs.userId],
      references: [users.id],
    }),
  })
);

export const inviteCodesRelations = relations(inviteCodes, ({ one, many }) => ({
  creator: one(users, {
    fields: [inviteCodes.createdBy],
    references: [users.id],
  }),
  redemptions: many(inviteCodeRedemptions),
}));

export const inviteCodeRedemptionsRelations = relations(
  inviteCodeRedemptions,
  ({ one }) => ({
    inviteCode: one(inviteCodes, {
      fields: [inviteCodeRedemptions.inviteCodeId],
      references: [inviteCodes.id],
    }),
    user: one(users, {
      fields: [inviteCodeRedemptions.userId],
      references: [users.id],
    }),
  })
);

export const aiToolAuditLogsRelations = relations(aiToolAuditLogs, ({ one }) => ({
  company: one(companies, {
    fields: [aiToolAuditLogs.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [aiToolAuditLogs.userId],
    references: [users.id],
  }),
  conversation: one(aiConversations, {
    fields: [aiToolAuditLogs.conversationId],
    references: [aiConversations.id],
  }),
  mcpConnection: one(mcpConnections, {
    fields: [aiToolAuditLogs.mcpConnectionId],
    references: [mcpConnections.id],
  }),
}));

// ── MCP Relations ─────────────────────────────────────────────────────────────

export const mcpConnectionsRelations = relations(mcpConnections, ({ one, many }) => ({
  company: one(companies, {
    fields: [mcpConnections.companyId],
    references: [companies.id],
  }),
  ownerUser: one(users, {
    fields: [mcpConnections.ownerUserId],
    references: [users.id],
  }),
  credentials: many(mcpCredentials),
  toolPrefs: many(mcpToolPrefs),
}));

export const mcpCredentialsRelations = relations(mcpCredentials, ({ one }) => ({
  mcpConnection: one(mcpConnections, {
    fields: [mcpCredentials.mcpConnectionId],
    references: [mcpConnections.id],
  }),
}));

export const mcpToolPrefsRelations = relations(mcpToolPrefs, ({ one }) => ({
  mcpConnection: one(mcpConnections, {
    fields: [mcpToolPrefs.mcpConnectionId],
    references: [mcpConnections.id],
  }),
}));

export const userPreferencesRelations = relations(
  userPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [userPreferences.userId],
      references: [users.id],
    }),
    company: one(companies, {
      fields: [userPreferences.companyId],
      references: [companies.id],
    }),
  })
);
