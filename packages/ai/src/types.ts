/**
 * Types for the @burnless/ai package.
 * Defines the contract between the AI layer, the engine, and the web app.
 */

import type { MonthlySeries, ComputedMetrics, ProfitAndLoss, CashFlowStatement } from "@burnless/engine";
import type { Company, Scenario, Account, FundingRound } from "@burnless/types";

// ── Financial context passed to the AI ──────────────────────────────────────

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
  expensesByMonth: Array<{ month: string; amount: number }>;
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
    isProjected: boolean;
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
  content: string;
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

export interface StreamChunk {
  type: "text" | "thinking" | "tool_use" | "tool_result" | "done" | "error";
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
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
