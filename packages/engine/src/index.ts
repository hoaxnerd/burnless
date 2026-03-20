// @burnless/engine — Pure TypeScript financial calculation library
// No database dependencies. Takes typed inputs, returns typed outputs.

// Utilities
export {
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

// Forecasting
export {
  computeForecastLine,
  computeAllForecastLines,
  buildForecastDependencyGraph,
  aggregateByAccount,
  evaluateSimpleExpression,
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
  type RevenueStreamInput,
  type SubscriptionParams,
  type OneTimeParams,
  type UsageBasedParams,
  type ServicesParams,
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
  type AccountData,
  type StatementLineItem,
  type ProfitAndLoss,
  type CashFlowStatement,
  type BalanceSheet,
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
  DEFAULT_CATEGORIZATION_RULES,
  type CategorizationRule,
  type CategorizationResult,
} from "./categorization";

// Payment providers (Stripe + Razorpay)
export {
  StripePaymentProvider,
  RazorpayPaymentProvider,
  resolvePaymentProvider,
  type PaymentProvider,
  type PaymentProviderType,
  type PaymentCustomer,
  type PaymentPlan,
  type PaymentSubscription,
  type CreateCheckoutOptions,
  type CheckoutSession,
} from "./payments";

// Bank connectors (Plaid + Account Aggregator)
export {
  PlaidBankConnector,
  AccountAggregatorConnector,
  resolveBankConnector,
  type BankConnector,
  type BankConnectorType,
  type BankAccount,
  type BankTransaction,
  type BankSyncResult,
  type LinkTokenOptions,
} from "./bank-connectors";
