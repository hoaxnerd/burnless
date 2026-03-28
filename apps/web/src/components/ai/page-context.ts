/**
 * Maps the current page path to context-aware AI suggested prompts.
 * The Companion uses these to offer relevant quick actions.
 */

interface PageContext {
  pageName: string;
  description: string;
  suggestedPrompts: string[];
}

const pageContextMap: Record<string, PageContext> = {
  "/dashboard": {
    pageName: "Dashboard",
    description: "overview of key metrics and financial health",
    suggestedPrompts: [
      "Give me a daily briefing on our financial health",
      "What's our biggest risk right now?",
      "How does this month compare to last month?",
      "When will we need to raise our next round?",
    ],
  },
  "/expenses": {
    pageName: "Expenses",
    description: "expense tracking and cost management",
    suggestedPrompts: [
      "What are our top 3 cost optimization opportunities?",
      "Categorize my recent uncategorized transactions",
      "Is our burn rate accelerating or decelerating?",
      "Which expenses grew the most this quarter?",
    ],
  },
  "/revenue": {
    pageName: "Revenue",
    description: "revenue streams and growth metrics",
    suggestedPrompts: [
      "What's our projected ARR by end of year?",
      "Analyze our net revenue retention rate",
      "Which revenue stream is growing fastest?",
      "How does our MRR growth compare to benchmarks?",
    ],
  },
  "/funding": {
    pageName: "Funding",
    description: "cap table, fundraising, and dilution",
    suggestedPrompts: [
      "What's the optimal raise amount at our current metrics?",
      "How much dilution would a $3M raise at $12M pre cause?",
      "When should we start fundraising based on our runway?",
      "Compare our metrics to Series A benchmarks",
    ],
  },
  "/team": {
    pageName: "Team",
    description: "headcount planning and compensation",
    suggestedPrompts: [
      "How does adding 3 engineers affect our runway?",
      "What's the optimal hiring sequence for next quarter?",
      "How does our compensation compare to market rates?",
      "What should our engineering-to-total headcount ratio be?",
    ],
  },
  "/scenarios": {
    pageName: "Scenarios",
    description: "financial scenario planning and modeling",
    suggestedPrompts: [
      "Create a conservative growth scenario for next year",
      "What if we cut burn rate by 20%?",
      "Model a scenario where we double our sales team",
      "Compare aggressive vs conservative hiring plans",
    ],
  },
  "/reports": {
    pageName: "Reports",
    description: "board updates and financial reporting",
    suggestedPrompts: [
      "Write a board update narrative for this month",
      "Summarize our key metrics for investors",
      "What story does our data tell this quarter?",
      "Generate talking points for our next board meeting",
    ],
  },
  "/import": {
    pageName: "Import",
    description: "data import and integrations",
    suggestedPrompts: [
      "What data should I import to get the most value?",
      "Help me map my CSV columns to Burnless fields",
      "What integrations would save me the most time?",
      "Review my imported data for potential issues",
    ],
  },
  "/data-room": {
    pageName: "Data Room",
    description: "investor data room and due diligence",
    suggestedPrompts: [
      "What documents should I include for Series A?",
      "Generate an executive summary for investors",
      "What metrics do VCs care about most at our stage?",
      "Help me prepare for due diligence questions",
    ],
  },
  "/settings": {
    pageName: "Settings",
    description: "app configuration and billing",
    suggestedPrompts: [
      "What AI features are available on my plan?",
      "Help me configure my financial year settings",
      "What data do you have access to?",
    ],
  },
};

/**
 * Get context-aware page info and suggested prompts for the Companion.
 * Falls back to generic prompts for unknown pages.
 */
export function getPageContext(pathname: string): PageContext {
  // Try exact match first
  if (pageContextMap[pathname]) return pageContextMap[pathname];

  // Try prefix match (e.g., /scenarios/123 → /scenarios)
  for (const [path, ctx] of Object.entries(pageContextMap)) {
    if (pathname.startsWith(path) && path !== "/") return ctx;
  }

  return {
    pageName: "Burnless",
    description: "financial planning",
    suggestedPrompts: [
      "Give me a quick financial health check",
      "What should I focus on this week?",
      "Summarize my key metrics",
    ],
  };
}
