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
];

/** Input (form) tools. Populated by Plan 4. */
export const GENUI_INPUT_TOOLS: ToolDefinition[] = [];
