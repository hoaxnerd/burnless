import {
  Download, FileText, Table, FolderOpen,
  FileBarChart, Upload, BarChart3, TrendingUp, Wallet,
  Timer, Target, LayoutGrid, Shuffle,
} from "lucide-react";
import type { ProfitAndLoss, CashFlowStatement, BalanceSheet } from "@burnless/engine";

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface DataRoomViewProps {
  companyName: string;
  scenarioName: string;
  scenarioAvailable: boolean;
  profitAndLoss: ProfitAndLoss;
  cashFlow: CashFlowStatement;
  balanceSheet: BalanceSheet;
  keyMetrics: Array<{ label: string; value: string; category: string }>;
  fundingRounds: Array<{ round: string; amount: number; date: string; valuation: number | null }>;
  startingCash: number;
  netBurnRate: number;
  runwayMonths: number;
}

export interface ExportItem {
  id: string;
  label: string;
  description: string;
  format: "pdf" | "csv";
  icon: typeof FileText;
}

export type TabId = "reports" | "exports" | "import";

/* ── Tab definitions ────────────────────────────────────────────────────────── */

export const tabs: Array<{ id: TabId; label: string; icon: typeof FileBarChart }> = [
  { id: "reports", label: "Reports", icon: FileBarChart },
  { id: "exports", label: "Exports", icon: Download },
  { id: "import", label: "Import", icon: Upload },
];

/* ── Report definitions ─────────────────────────────────────────────────────── */

export const reports = [
  {
    id: "board-update",
    title: "Board Update",
    description: "Investor-ready monthly report with AI narratives and key metrics",
    href: "/reports/board-update",
    icon: FileBarChart,
    featured: true,
    color: "from-brand-500 to-indigo-500",
  },
  {
    id: "profit-loss",
    title: "Profit & Loss",
    description: "Income, expenses, and net profit over time",
    href: "/reports/profit-loss",
    icon: TrendingUp,
    color: "from-emerald-500 to-teal-500",
  },
  {
    id: "cash-flow",
    title: "Cash Flow",
    description: "Cash inflows, outflows, and net position",
    href: "/reports/cash-flow",
    icon: Wallet,
    color: "from-blue-500 to-cyan-500",
  },
  {
    id: "balance-sheet",
    title: "Balance Sheet",
    description: "Assets, liabilities, and equity snapshot",
    href: "/reports/balance-sheet",
    icon: BarChart3,
    color: "from-violet-500 to-purple-500",
  },
  {
    id: "runway",
    title: "Runway Analysis",
    description: "How long your cash will last at current burn",
    href: "/reports/runway",
    icon: Timer,
    color: "from-orange-500 to-amber-500",
  },
  {
    id: "budget-vs-actuals",
    title: "Budget vs Actuals",
    description: "Compare planned vs actual spending",
    href: "/reports/budget-vs-actuals",
    icon: Target,
    color: "from-rose-500 to-pink-500",
  },
  {
    id: "metrics",
    title: "Metrics Explorer",
    description: "Browse all 60+ financial and SaaS metrics",
    href: "/reports/metrics",
    icon: LayoutGrid,
    color: "from-sky-500 to-blue-500",
  },
  {
    id: "scenario-compare",
    title: "Scenario Comparison",
    description: "Compare two scenarios side by side with delta analysis",
    href: "/scenarios/compare",
    icon: Shuffle,
    color: "from-fuchsia-500 to-pink-500",
  },
];

/* ── Export items ────────────────────────────────────────────────────────────── */

export const exportItems: ExportItem[] = [
  { id: "full-deck", label: "Full Financial Package", description: "Complete investor data room with all statements and metrics", format: "pdf", icon: FolderOpen },
  { id: "pnl", label: "Profit & Loss", description: "Income statement with revenue, expenses, and margins", format: "pdf", icon: FileText },
  { id: "cashflow", label: "Cash Flow Statement", description: "Operating, investing, and financing cash flows", format: "pdf", icon: FileText },
  { id: "balance", label: "Balance Sheet", description: "Assets, liabilities, and equity", format: "pdf", icon: FileText },
  { id: "runway", label: "Runway Summary", description: "Cash position, burn rate, and runway projections", format: "pdf", icon: FileText },
  { id: "pnl-csv", label: "Profit & Loss (CSV)", description: "Full P&L with monthly breakdown by account", format: "csv", icon: Table },
  { id: "cashflow-csv", label: "Cash Flow (CSV)", description: "Cash flow statement with monthly columns", format: "csv", icon: Table },
  { id: "balance-csv", label: "Balance Sheet (CSV)", description: "Assets, liabilities, and equity monthly breakdown", format: "csv", icon: Table },
  { id: "metrics-csv", label: "Key Metrics (CSV)", description: "All financial metrics in spreadsheet format", format: "csv", icon: Table },
  { id: "funding-csv", label: "Funding History (CSV)", description: "Funding rounds, amounts, and valuations", format: "csv", icon: Table },
];

/* ── Report Builder sections ────────────────────────────────────────────────── */

export const reportSections = [
  { id: "snapshot", label: "Financial Snapshot", description: "Key metrics overview", exportIds: ["metrics-csv"] },
  { id: "pnl", label: "Profit & Loss", description: "Revenue & expenses", exportIds: ["pnl", "pnl-csv"] },
  { id: "cashflow", label: "Cash Flow", description: "Inflows & outflows", exportIds: ["cashflow", "cashflow-csv"] },
  { id: "balance", label: "Balance Sheet", description: "Assets & liabilities", exportIds: ["balance", "balance-csv"] },
  { id: "runway", label: "Runway Analysis", description: "Burn & runway", exportIds: ["runway"] },
  { id: "funding", label: "Funding History", description: "Rounds & valuations", exportIds: ["funding-csv"] },
];
