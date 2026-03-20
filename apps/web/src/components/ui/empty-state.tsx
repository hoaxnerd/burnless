import Link from "next/link";
import {
  Receipt,
  TrendingUp,
  Landmark,
  Users,
  GitBranch,
  FileBarChart,
  FolderOpen,
  Sparkles,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  aiHint?: string;
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export function PageEmptyState({
  icon: Icon,
  title,
  description,
  ctaLabel,
  ctaHref,
  aiHint,
}: EmptyStateProps) {
  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 p-8 sm:p-12 text-center animate-scale-in">
      <div className="inline-flex items-center justify-center rounded-2xl bg-brand-500/10 p-4 mb-5">
        <Icon className="h-8 w-8 text-brand-500" />
      </div>
      <h3 className="text-xl font-bold text-surface-900 mb-2">{title}</h3>
      <p className="text-sm text-surface-500 mb-8 max-w-sm mx-auto leading-relaxed">
        {description}
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          href={ctaHref}
          className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shadow-md hover:shadow-lg"
        >
          {ctaLabel}
        </Link>
      </div>
      {aiHint && (
        <div className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-50/50 border border-brand-500/10 px-4 py-2.5">
          <Sparkles className="h-4 w-4 text-brand-500 flex-shrink-0" />
          <p className="text-xs text-brand-600">{aiHint}</p>
        </div>
      )}
    </div>
  );
}

/* ── Setup / Scenario prompts (reusable) ───────────────────────────────────── */

export function SetupPrompt({ context }: { context?: string }) {
  return (
    <PageEmptyState
      icon={Sparkles}
      title="Welcome to Burnless"
      description={`Complete onboarding to set up your company${context ? ` and start ${context}` : ""}.`}
      ctaLabel="Get started"
      ctaHref="/onboarding"
      aiHint="AI will guide you through setup in under 2 minutes"
    />
  );
}

export function ScenarioPrompt({ context }: { context?: string }) {
  return (
    <PageEmptyState
      icon={GitBranch}
      title="Create Your First Scenario"
      description={`A scenario is your financial model.${context ? ` You need one to ${context}.` : " Start with a base case and explore alternatives."}`}
      ctaLabel="Create scenario"
      ctaHref="/scenarios/new"
      aiHint="Try asking AI: &ldquo;Create a base scenario for my startup&rdquo;"
    />
  );
}

/* ── Page-specific empty states ────────────────────────────────────────────── */

export function ExpensesEmptyState() {
  return (
    <PageEmptyState
      icon={Receipt}
      title="Track Your Spending"
      description="Add your first expense or import from a CSV. AI will auto-categorize everything and flag anomalies."
      ctaLabel="Add expenses"
      ctaHref="/import"
      aiHint="Drag &amp; drop a CSV and AI handles the rest"
    />
  );
}

export function RevenueEmptyState() {
  return (
    <PageEmptyState
      icon={TrendingUp}
      title="Model Your Revenue"
      description="Add revenue streams — subscriptions, one-time sales, or usage-based pricing. See MRR, ARR, and growth projections instantly."
      ctaLabel="Add revenue stream"
      ctaHref="/revenue"
      aiHint="Ask AI: &ldquo;Help me model my SaaS revenue&rdquo;"
    />
  );
}

export function FundingEmptyState() {
  return (
    <PageEmptyState
      icon={Landmark}
      title="Track Your Capital"
      description="Record funding rounds to calculate runway, cash position, and ownership dilution. Plan your next raise with confidence."
      ctaLabel="Add funding round"
      ctaHref="/funding"
      aiHint="AI can suggest optimal raise timing based on your burn rate"
    />
  );
}

export function TeamEmptyState() {
  return (
    <PageEmptyState
      icon={Users}
      title="Plan Your Team"
      description="Map your org structure and model hiring plans. See how each hire impacts runway and per-employee efficiency."
      ctaLabel="Add team member"
      ctaHref="/team"
      aiHint="Ask AI: &ldquo;What&rsquo;s the runway impact of hiring 3 engineers?&rdquo;"
    />
  );
}

export function ScenariosEmptyState() {
  return (
    <PageEmptyState
      icon={GitBranch}
      title="Explore What-If Scenarios"
      description="Create scenarios to model different futures — fundraise, growth acceleration, layoffs, or custom what-if analyses."
      ctaLabel="Create first scenario"
      ctaHref="/scenarios/new"
      aiHint="Try: &ldquo;What if we raise $3M at $15M pre?&rdquo;"
    />
  );
}

export function ReportsEmptyState() {
  return (
    <PageEmptyState
      icon={FileBarChart}
      title="Unlock Financial Reports"
      description="Add financial data to generate investor-ready P&L, cash flow, balance sheet, and runway analysis reports."
      ctaLabel="Go to dashboard"
      ctaHref="/dashboard"
      aiHint="Reports auto-generate once you have a scenario with data"
    />
  );
}

export function DataRoomEmptyState() {
  return (
    <PageEmptyState
      icon={FolderOpen}
      title="Your Investor Data Room"
      description="A polished, shareable snapshot of your financials for investors and board members. Add data to unlock."
      ctaLabel="Set up financials"
      ctaHref="/dashboard"
      aiHint="AI can generate board update narratives from your data"
    />
  );
}
