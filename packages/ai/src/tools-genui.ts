/** Generative-UI tool definitions (display + input). Spec 2026-06-02 §4. */
import type { ToolDefinition } from "./providers";

/** Data-bound + presentational display tools. Populated by Plans 2–3. */
export const GENUI_DISPLAY_TOOLS: ToolDefinition[] = [
  {
    name: "show_metric_card",
    description:
      "Display a single key metric inline as a card with its value and (when available) a recent trend. Use when the user asks about one metric (runway, burn, MRR, ARR, cash, gross margin, etc.). Numbers are computed server-side — you only choose the metric.",
    inputSchema: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          enum: [
            "runway",
            "net_burn",
            "mrr",
            "arr",
            "cash",
            "gross_margin",
            "ltv",
            "cac",
            "ltv_cac",
            "churn",
          ],
          description: "Which metric to show.",
        },
        scenarioId: {
          type: "string",
          description: "Optional scenario id; defaults to the active scenario.",
        },
      },
      required: ["metric"],
    },
  },
  {
    name: "show_kpi_grid",
    description:
      "Display several key metrics together inline as a compact grid of cards. Use when the user asks about multiple metrics at once or wants an at-a-glance summary (e.g. runway + MRR + burn). Numbers are computed server-side — you only choose which 2–8 metrics to include.",
    inputSchema: {
      type: "object",
      properties: {
        metrics: {
          type: "array",
          minItems: 2,
          maxItems: 8,
          items: {
            type: "string",
            enum: [
              "runway",
              "net_burn",
              "mrr",
              "arr",
              "cash",
              "gross_margin",
              "ltv",
              "cac",
              "ltv_cac",
              "churn",
            ],
          },
          description: "Which 2–8 metrics to show in the grid.",
        },
        scenarioId: {
          type: "string",
          description: "Optional scenario id; defaults to the active scenario.",
        },
      },
      required: ["metrics"],
    },
  },
  {
    name: "show_line_chart",
    description:
      "Display a monthly time series inline as a line chart. Use when the user asks to chart or trend a value over time (revenue, MRR, net burn, cash, headcount cost). Numbers are computed server-side — you only choose the series and how many recent months to show.",
    inputSchema: {
      type: "object",
      properties: {
        series: {
          type: "string",
          enum: ["mrr", "revenue", "net_burn", "cash", "headcount_cost"],
          description: "Which monthly series to chart. Defaults to revenue.",
        },
        months: {
          type: "integer",
          minimum: 1,
          maximum: 36,
          description: "How many of the most recent months to show. Defaults to 12.",
        },
        scenarioId: {
          type: "string",
          description: "Optional scenario id; defaults to the active scenario.",
        },
      },
      required: [],
    },
  },
  {
    name: "show_bar_chart",
    description:
      "Display a categorical breakdown inline as a bar chart. Use when the user asks to compare amounts across categories rather than over time — expenses by category, or revenue by stream type. Numbers are computed server-side — you only choose the dimension.",
    inputSchema: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["expense_by_category", "revenue_by_stream"],
          description:
            "What to break down. 'expense_by_category' shows current expense totals per category; 'revenue_by_stream' shows revenue per stream type. Defaults to expense_by_category.",
        },
        scenarioId: {
          type: "string",
          description: "Optional scenario id; defaults to the active scenario.",
        },
      },
      required: [],
    },
  },
  {
    name: "show_area_chart",
    description:
      "Display a cumulative or balance-over-time series inline as a filled area chart. Use when the user wants to see cash balance running down over time (cash runway) or revenue accumulating (cumulative revenue). Numbers are computed server-side — you only choose the series and how many recent months to show.",
    inputSchema: {
      type: "object",
      properties: {
        series: {
          type: "string",
          enum: ["cash_runway", "cumulative_revenue"],
          description:
            "Which area series to show. 'cash_runway' is the cash balance per month; 'cumulative_revenue' is revenue summed from the start. Defaults to cash_runway.",
        },
        months: {
          type: "integer",
          minimum: 1,
          maximum: 36,
          description: "How many of the most recent months to show. Defaults to 18.",
        },
        scenarioId: {
          type: "string",
          description: "Optional scenario id; defaults to the active scenario.",
        },
      },
      required: [],
    },
  },
  {
    name: "show_runway",
    description:
      "Display a focused runway summary card inline: months of runway remaining, current net burn, cash on hand, and the projected cash-out month. Use when the user asks specifically about runway, how long the cash lasts, or when they run out of money. Numbers are computed server-side — you only request the card.",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: {
          type: "string",
          description: "Optional scenario id; defaults to the active scenario.",
        },
      },
      required: [],
    },
  },
  {
    name: "show_cap_table",
    description:
      "Display the company cap table inline as a table: each holder's share class, shares, and fully-diluted ownership percentage, plus total shares. Use when the user asks about ownership, equity splits, the cap table, dilution, or who owns the company. Numbers are computed server-side (scenario-aware) — you only request the table.",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: {
          type: "string",
          description: "Optional scenario id; defaults to the active scenario.",
        },
      },
      required: [],
    },
  },
  {
    name: "show_scenario_diff",
    description:
      "Display a side-by-side comparison of two scenarios inline as a table: each key metric (revenue, expenses, net income, cash, headcount) for scenario A vs scenario B with the delta. Use when the user asks to compare two scenarios, see what changed between plans, or weigh one scenario against another. Numbers are computed server-side — you only choose the two scenario ids.",
    inputSchema: {
      type: "object",
      properties: {
        scenarioA: {
          type: "string",
          description: "Id of the first (baseline) scenario to compare.",
        },
        scenarioB: {
          type: "string",
          description: "Id of the second scenario to compare against the first.",
        },
      },
      required: ["scenarioA", "scenarioB"],
    },
  },
  {
    name: "show_burn_breakdown",
    description:
      "Display where the monthly cash burn is going, inline as a bar chart broken down by expense category. Use when the user asks to break down their burn, see what they're spending on, or understand where the money goes each month. Numbers are computed server-side (scenario-aware) — you only request the breakdown.",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: {
          type: "string",
          description: "Optional scenario id; defaults to the active scenario.",
        },
      },
      required: [],
    },
  },
  {
    name: "show_funding_summary",
    description:
      "Display the company's funding history inline as a timeline of rounds: each round's name, type, amount, and date, plus the total raised. Projected/planned rounds are shown distinctly. Use when the user asks about their funding rounds, how much they've raised, their cap-raising history, or upcoming rounds. Numbers are computed server-side (scenario-aware) — you only request the summary.",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: {
          type: "string",
          description: "Optional scenario id; defaults to the active scenario.",
        },
      },
      required: [],
    },
  },
];

/** Input (form) tools. Populated by Plan 4. */
export const GENUI_INPUT_TOOLS: ToolDefinition[] = [];
