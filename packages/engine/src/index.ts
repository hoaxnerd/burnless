// @burnless/engine — Pure TypeScript financial calculation library
// No database dependencies. Takes typed inputs, returns typed outputs.
// All monetary arithmetic uses Decimal.js internally for precision.

// Decimal utilities (for consumers who need precise arithmetic)
export { D, dRound2, dSum, dMul, dDiv, dAdd, dSub, dPow, Decimal } from "./decimal";

// Utilities
export {
  toDate,
  monthRange,
  monthKey,
  parseMonthKey,
  round2,
  isActiveInMonth,
  proratedFraction,
  sum,
  emptySeries,
  addSeries,
  subtractSeries,
  scaleSeries,
  seriesToArray,
  type MonthlySeries,
} from "./utils";

// Dependency graph
export {
  DependencyGraph,
  CircularDependencyError,
} from "./dag";

// Formula evaluator (mathjs-based, sandboxed)
export {
  evaluateFormula,
  evaluateSimpleExpression,
  validateFormula,
  type FormulaContext,
  type FormulaResult,
} from "./formula";

// Forecasting
export {
  computeForecastLine,
  computeAllForecastLines,
  buildForecastDependencyGraph,
  aggregateByAccount,
  type ForecastLineInput,
  type FixedParams,
  type GrowthRateParams,
  type PerUnitParams,
  type PercentageOfParams,
  type CustomFormulaParams,
  type ForecastParams,
} from "./forecasting";

// Revenue modeling
export {
  computeRevenueStream,
  computeTotalRevenue,
  computeSubscriptionDetail,
  selectTier,
  type RevenueStreamInput,
  type SubscriptionParams,
  type OneTimeParams,
  type UsageBasedParams,
  type ServicesParams,
  type MarketplaceParams,
  type EcommerceParams,
  type HardwareParams,
  type PricingTier,
  type SubscriptionDetail,
} from "./revenue";

// Headcount planning
export {
  computeHeadcountPlanCost,
  computeAllHeadcountCosts,
  type HeadcountPlanInput,
  type HeadcountCostBreakdown,
} from "./headcount";

// Financial statements
export {
  generateProfitAndLoss,
  generateCashFlow,
  generateBalanceSheet,
  computeAccountsReceivable,
  computeAccountsPayable,
  computeDepreciation,
  computeWorkingCapitalAdjustments,
  type AccountData,
  type StatementLineItem,
  type ProfitAndLoss,
  type CashFlowStatement,
  type BalanceSheet,
  type WorkingCapitalConfig,
  type WorkingCapitalAdjustments,
  type PaymentTerms,
  type CapitalAsset,
} from "./statements";

// Metrics calculator
export {
  computeAllMetrics,
  computeCustomMetrics,
  type MetricsInput,
  type MetricValue,
  type ComputedMetrics,
  type CustomMetricDefinition,
} from "./metrics";

// Metric registry — catalog, definitions, dependency graph, formatting
export {
  METRIC_REGISTRY,
  CATEGORY_META,
  DEFAULT_HERO_CARDS,
  DEFAULT_SECONDARY_METRICS,
  INTELLIGENCE_DEFAULTS,
  getMetricDef,
  getMetricsByCategory,
  getMetricsByTier,
  getMetricCatalog,
  buildMetricDependencyGraph,
  getMetricDependencyTree,
  getMetricDependents,
  getTransitiveDependents,
  ENTITY_METRIC_IMPACT,
  getAffectedMetricSlugs,
  extractMetricValue,
  formatMetricValue,
  evaluateBenchmark,
  isMetricDataAvailable,
  getMetricMissingDataHint,
  getMetricFallbacks,
  HERO_CARD_FALLBACK_ORDER,
  getHeroSwaps,
  type MetricFallback,
  type HeroSwapResult,
  type MetricDefinition,
  type MetricCategory,
  type MetricTier,
  type MetricFormat,
  type MetricBenchmark,
  type SignalDirection,
} from "./metric-registry";

// Scenario comparison
export {
  compareScenarios,
  type ScenarioData,
  type ScenarioComparison,
  type ComparisonLine,
} from "./scenarios";

// Budget vs. Actuals
export {
  computeBudgetVsActuals,
  type AccountBudgetInput,
  type BudgetVsActuals,
  type BudgetLineItem,
} from "./budget";

// Funding & cap table
export {
  computeCapTable,
  computeFundingImpact,
  computeDebt,
  computeSafeConversion,
  computeConvertibleNote,
  computeGrant,
  type CapTable,
  type CapTableRow,
  type CapTableInput,
  type FundingImpact,
  type FundingImpactInput,
  type ShareClassInput,
  type OptionPoolInput,
  type EquityParams,
  type SafeParams,
  type ConvertibleParams,
  type DebtParams,
  type GrantParams,
  type GrantMatchWarning,
  type FundingRoundInput,
  type FundingRoundType,
} from "./funding";

// Integration framework
export {
  ProviderRegistry,
  createDefaultRegistry,
  type IntegrationProvider,
  type SyncOptions,
  type SyncResult,
  type MappedTransaction,
} from "./integrations";

// Transaction categorization
export {
  categorizeTransaction,
  categorizeTransactions,
  categorizeWithMemory,
  categorizeTransactionsWithMemory,
  extractMerchantKey,
  DEFAULT_CATEGORIZATION_RULES,
  type CategorizationRule,
  type CategorizationResult,
  type EnrichedCategorizationResult,
  type MerchantMapping,
} from "./categorization";

// Slot types — universal slot-based card system
export * from "./slot-types";

// Payment providers — import directly from "@burnless/engine/payments" when needed.
// Not re-exported here to avoid bundling optional plaid/razorpay/stripe SDKs.
export type {
  PaymentProvider,
  PaymentProviderType,
  PaymentCustomer,
  PaymentPlan,
  PaymentSubscription,
  CreateCheckoutOptions,
  CheckoutSession,
  NormalizedWebhookData,
  NormalizedWebhookEvent,
} from "./payments";

// Bank connectors — import directly from "@burnless/engine/bank-connectors" when needed.
// Not re-exported here to avoid bundling optional plaid SDK.
export type {
  BankConnector,
  BankConnectorType,
  BankAccount,
  BankTransaction,
  BankSyncResult,
  LinkTokenOptions,
} from "./bank-connectors";

// Service abstractions — swappable local/production providers
export {
  createSearchService,
  resetSearchService,
  NoopSearchProvider,
  createCrawlService,
  resetCrawlService,
  Crawl4AIProvider,
  NoopCrawlProvider,
  createWebSearchService,
  resetWebSearchService,
  SearXNGProvider,
  NoopWebSearchProvider,
  type SearchService,
  type SearchDocument,
  type SearchResult,
  type SearchOptions,
  type CrawlService,
  type CrawlResult,
  type CrawlOptions,
  type WebSearchService,
  type WebSearchResult,
  type WebSearchOptions,
} from "./services";
