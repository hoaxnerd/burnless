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

// Forecasting
export {
  computeForecastLine,
  computeAllForecastLines,
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
  type MetricsInput,
  type MetricValue,
  type ComputedMetrics,
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
