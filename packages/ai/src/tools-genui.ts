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
];

/** Input (form) tools. Populated by Plan 4. */
export const GENUI_INPUT_TOOLS: ToolDefinition[] = [];
