/**
 * Types for the @burnless/ai package.
 * Defines the contract between the AI layer, the engine, and the web app.
 */

import type { MonthlySeries, ComputedMetrics, ProfitAndLoss, CashFlowStatement } from "@burnless/engine";
import type { Company, Scenario, Account, FundingRound } from "@burnless/types";
import type { ContentBlock } from "./providers/types";
import type { InputFormSpec, PlanSpec } from "./generative-ui";

// ── Financial context passed to the AI ──────────────────────────────────────

/** Single revenue stream snapshot (currency-agnostic — raw numbers only). */
export interface RevenueStreamSnapshotRow {
  id: string;
  name: string;
  type: "subscription" | "one_time" | "usage_based" | "services" | "marketplace" | "ecommerce" | "hardware";
  /** ISO YYYY-MM-DD */
  startDate: string;
  /** ISO YYYY-MM-DD or null if open-ended */
  endDate: string | null;
  parameters: Record<string, unknown>;
  /** Most-recent month's resolved revenue in raw number units. */
  currentAmount: number;
  /** "flat" | "per_seat" | "tiered". Only meaningful for subscription/usage_based. */
  pricingModel?: "flat" | "per_seat" | "tiered";
  /** Number of tiers configured (per_seat or tiered pricing only). */
  tierCount?: number;
}

export interface ExpenseSnapshotRow {
  id: string;
  accountId: string;
  accountName: string;
  vendor: string | null;
  notes: string | null;
  frequency: "monthly" | "quarterly" | "annual";
  departmentId: string | null;
  isOneTime: boolean;
  isRecurring: boolean | null;
  method: "fixed" | "growth_rate" | "per_unit" | "percentage_of" | "custom_formula";
  /** Most-recent month's resolved amount in company currency units (number, not formatted). */
  currentAmount: number;
}

export interface FinancialSnapshot {
  company: {
    name: string;
    stage: string;
    businessModel: string;
    industry: string | null;
    currency: string;
    locale?: string;
  };
  scenario: {
    id: string;
    name: string;
    source: string;
  };
  period: {
    start: string;
    end: string;
    currentMonth: string;
  };
  keyMetrics: {
    mrr: number | null;
    arr: number | null;
    burnRate: number | null;
    netBurn: number | null;
    runway: number | null;
    cashPosition: number | null;
    revenueGrowth: number | null;
    grossMargin: number | null;
    headcount: number | null;
    ltv: number | null;
    cac: number | null;
    ltvCacRatio: number | null;
    churnRate: number | null;
  };
  revenueByMonth: Array<{ month: string; amount: number }>;
  revenueStreams: RevenueStreamSnapshotRow[];
  expensesByMonth: Array<{ month: string; amount: number }>;
  /** Per-line expense detail; `expensesByMonth` (aggregate) is preserved for back-compat. */
  expenses: ExpenseSnapshotRow[];
  cashByMonth: Array<{ month: string; amount: number }>;
  headcountByMonth: Array<{ month: string; count: number }>;
  profitAndLoss: {
    totalRevenue: number;
    totalCogs: number;
    grossProfit: number;
    totalOpex: number;
    netIncome: number;
  };
  fundingRounds: Array<{
    name: string;
    type: string;
    amount: number;
    date: string;
    closeDate: string | null;
    isProjected: boolean;
    parameters: Record<string, unknown>;
    investors: Array<{ name: string; amountInvested: number }>;
    interestPaidYtd: number;
    principalPaidYtd: number;
  }>;
  scenarios: Array<{
    id: string;
    name: string;
    source: string;
    status: string;
  }>;
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    category: string;
  }>;
  departments: Array<{
    id: string;
    name: string;
  }>;
  /**
   * Per-headcount detail for the active scenario — enables AI tools to reason
   * about individual hires rather than only aggregate cost. Phase 1 §1.5.
   */
  headcountDetails: Array<{
    id: string;
    title: string;
    name: string | null;
    employeeType: string;
    count: number;
    salary: number;
    salaryChanges: Array<{
      effectiveDate: string;
      newSalary: number;
      reason: string | null;
    }>;
    bonuses: Array<{
      payoutMonth: string;
      amount: number;
      type: string;
    }>;
    equityGrants: Array<{
      grantDate: string;
      shares: number;
      grantType: string;
      vestingSchedule: Array<{ type: string; date: string; sharesVested: number }>;
    }>;
  }>;
}

// ── Chat types ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  /** Plain text, or structured content blocks (used when resuming a paused turn). */
  content: string | ContentBlock[];
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  scenarioId?: string;
}

export interface ChatResponse {
  message: string;
  conversationId: string;
  toolResults?: ToolCallResult[];
}

export interface ToolCallResult {
  tool: string;
  input: Record<string, unknown>;
  result: string;
}

// ── Streaming types ─────────────────────────────────────────────────────────

export interface PendingToolUse {
  /** The provider tool_use id — correlates the decision back to the call. */
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

export interface PauseState {
  /** The assistant turn's raw content blocks (includes all tool_use). */
  assistantBlocks: ContentBlock[];
  /** tool_result blocks for tools already executed this turn (auto-allowed). */
  completedResults: ContentBlock[];
  /** Tools awaiting a user decision. */
  pending: PendingToolUse[];
}

export interface StreamChunk {
  type:
    | "text"
    | "thinking"
    | "tool_use"
    | "tool_status"
    | "tool_result"
    | "permission_request"
    | "input_request"
    | "plan_request"
    | "paused"
    | "done"
    | "error";
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  /** For tool_status: lifecycle phase of an executing tool. */
  phase?: "running" | "done" | "error";
  /** For permission_request: the tools awaiting a decision. */
  actions?: PendingToolUse[];
  /** For permission_request/input_request/paused: correlates the persisted batch. */
  pauseId?: string;
  /** For input_request: the form to render. */
  spec?: InputFormSpec;
  /** For plan_request: the proposed plan to review. */
  plan?: PlanSpec;
  /** Binary model confidence on a result node (spec §4.3); P4 timeline result nodes
   *  consume this. Optional plumbing — populated by the Plan 5 prompt convention. */
  confidence?: "high" | "low";
  /** One-line "because you said X" rationale on a result node (spec §4.3). */
  rationale?: string;
}

// ── Tool definitions ────────────────────────────────────────────────────────

export interface ToolHandler {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>, context: ToolContext) => Promise<string>;
}

export interface ToolContext {
  companyId: string;
  scenarioId: string;
  userId: string;
}

// ── Insight types ───────────────────────────────────────────────────────────

export type InsightType =
  | "variance_analysis"
  | "runway_alert"
  | "financial_narrative"
  | "benchmark"
  | "coaching";

export interface Insight {
  type: InsightType;
  title: string;
  summary: string;
  details: string;
  severity: "info" | "warning" | "critical";
  relatedMetrics: string[];
}
