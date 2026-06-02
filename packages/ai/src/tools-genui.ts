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
  {
    name: "show_data_table",
    description:
      "Display a structured dataset inline as a table. Choose `pl_summary` for a profit-and-loss summary (each P&L line with its latest-month amount), `revenue_streams` for per-stream monthly revenue, or `expenses` for a per-category cost breakdown. Use when the user asks to see numbers laid out in a table or asks for a P&L / revenue / expense summary. Numbers are computed server-side (scenario-aware) — you only choose the dataset.",
    inputSchema: {
      type: "object",
      properties: {
        dataset: {
          type: "string",
          enum: ["pl_summary", "revenue_streams", "expenses"],
          description: "Which dataset to tabulate. Defaults to pl_summary.",
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
    name: "show_callout",
    description:
      "Display a highlighted note (info/success/warning/critical) inline. Use to emphasize a takeaway, risk, or recommendation. You author the text; this shows no financial data on its own.",
    inputSchema: {
      type: "object",
      properties: {
        severity: {
          type: "string",
          enum: ["info", "success", "warning", "critical"],
          description: "Visual tone.",
        },
        title: { type: "string", description: "Short heading." },
        body: { type: "string", description: "1–3 sentence message." },
      },
      required: ["severity", "body"],
    },
  },
  {
    name: "show_comparison_table",
    description:
      "Display a side-by-side comparison you author yourself, inline as a table — e.g. options, approaches, or trade-offs across 2–6 columns. Use to lay out a qualitative comparison (hire now vs later, build vs buy, plan A vs plan B). You author every cell as text; this shows no financial data on its own.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short heading for the table." },
        columns: {
          type: "array",
          minItems: 2,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "Stable column key referenced by each row." },
              label: { type: "string", description: "Column header text." },
            },
            required: ["key", "label"],
          },
          description: "2–6 columns; each row is keyed by these column keys.",
        },
        rows: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            description: "An object keyed by the column keys; values are display strings.",
          },
          description: "1–20 rows; each is an object mapping column key → cell text.",
        },
      },
      required: ["columns", "rows"],
    },
  },
  {
    name: "show_checklist",
    description:
      "Display a checklist you author yourself, inline — e.g. a prep list, action items, or steps to verify. Mark items already done with checked:true. You author every item as text; this shows no financial data on its own.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short heading for the checklist." },
        items: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            properties: {
              text: { type: "string", description: "Checklist item text." },
              checked: {
                type: "boolean",
                description: "Whether this item is already done. Defaults to false.",
              },
            },
            required: ["text"],
          },
          description: "1–20 checklist items.",
        },
      },
      required: ["items"],
    },
  },
  {
    name: "show_suggested_actions",
    description:
      "Display a row of suggested next-step buttons you author yourself, inline. Each action has a label and a follow-up prompt that is sent as a new message when the user clicks it. Use to offer the user 1–5 concrete next things to explore. You author every label and prompt; this shows no financial data on its own.",
    inputSchema: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Button text shown to the user." },
              prompt: {
                type: "string",
                description: "The follow-up message sent as a new chat turn when clicked.",
              },
            },
            required: ["label", "prompt"],
          },
          description: "1–5 suggested actions, each a { label, prompt }.",
        },
      },
      required: ["actions"],
    },
  },
  {
    name: "show_progress_steps",
    description:
      "Display a sequence of steps you author yourself, inline as a vertical stepper — e.g. a process, a roadmap, or stages toward a goal. Mark each step done/active/pending to show where things stand. You author every step label as text; this shows no financial data on its own.",
    inputSchema: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Step text shown to the user." },
              status: {
                type: "string",
                enum: ["done", "active", "pending"],
                description:
                  "Where this step stands: 'done' (completed), 'active' (in progress), or 'pending' (not started).",
              },
            },
            required: ["label", "status"],
          },
          description: "1–12 ordered steps, each a { label, status }.",
        },
      },
      required: ["steps"],
    },
  },
];

/** Input (form) tools. Populated by Plan 4. */
export const GENUI_INPUT_TOOLS: ToolDefinition[] = [];

GENUI_INPUT_TOOLS.push(
  {
    name: "request_input_form",
    description:
      "Pause and show the user a form to collect structured data when you need values you don't have. Define the fields yourself. Pre-fill `defaultValue` with your PROPOSED values and offer `options` for choices — the user edits or accepts. The submission comes back to you as a tool result; you then decide whether to call a write tool (which will ask the user's permission). Collecting input does NOT save anything.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Form heading." },
        description: { type: "string", description: "Optional sub-text." },
        submitLabel: { type: "string", description: "Submit button label." },
        fields: {
          type: "array",
          description: "Fields to collect.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: {
                type: "string",
                enum: [
                  "currency",
                  "percent",
                  "number",
                  "integer",
                  "text",
                  "select",
                  "date",
                  "date_range",
                ],
              },
              label: { type: "string" },
              placeholder: { type: "string" },
              hint: { type: "string" },
              required: { type: "boolean" },
              defaultValue: { description: "Your proposed value." },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: { value: { type: "string" }, label: { type: "string" } },
                  required: ["value", "label"],
                },
              },
              min: { type: "number" },
              max: { type: "number" },
              step: { type: "number" },
            },
            required: ["name", "type", "label"],
          },
        },
      },
      required: ["title", "fields"],
    },
  },
  {
    name: "request_revenue_stream",
    description:
      "Show a ready-made form to collect a new revenue stream (name, type, monthly amount, start date). Pass `defaults` to pre-fill your proposed values. After submission, call create_revenue_stream with the returned data.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        defaults: { type: "object", description: "Proposed field values keyed by field name." },
      },
      required: [],
    },
  },
  {
    name: "request_headcount",
    description:
      "Show a ready-made form to collect a new hire (role title, salary, start date, count). Pass `defaults` to pre-fill. After submission, call create_headcount.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        defaults: { type: "object" },
      },
      required: [],
    },
  },
  {
    name: "request_forecast_line",
    description:
      "Show a ready-made form to collect a forecast line (name, method, base amount, start date). Pass `defaults` to pre-fill. After submission, call create_forecast_line.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        defaults: { type: "object" },
      },
      required: [],
    },
  },
);
