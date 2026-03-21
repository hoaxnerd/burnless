// @burnless/engine — Pure TypeScript financial calculation library
// No database dependencies. Takes typed inputs, returns typed outputs.
// All monetary arithmetic uses Decimal.js internally for precision.

// Decimal utilities (for consumers who need precise arithmetic)
export { D, dRound2, dSum, dMul, dDiv, dAdd, dSub, dPow, Decimal } from "./decimal";

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
  categorizeWithMemory,
  categorizeTransactionsWithMemory,
  extractMerchantKey,
  DEFAULT_CATEGORIZATION_RULES,
  type CategorizationRule,
  type CategorizationResult,
  type EnrichedCategorizationResult,
  type MerchantMapping,
} from "./categorization";

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
