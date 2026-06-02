/**
 * Generative-UI contract (spec 2026-06-02 §3–§5). Provider-neutral.
 *
 * Two tool flavors beyond the existing data tools:
 *  - DISPLAY tools (`show_*`) render inline; classified `read`; never pause.
 *  - INPUT tools (`request_*`) PAUSE the turn to collect structured data, then
 *    feed the submission back as a tool_result on resume.
 * Both classify as `read` (categorizeToolName default) — no permission card.
 */

export type FormFieldType =
  | "currency" | "percent" | "number" | "integer"
  | "text" | "select" | "date" | "date_range";

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormField {
  /** Submitted-data key; maps to the follow-up write tool's argument. */
  name: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  /** The AI's PROPOSED/prefilled value — the user edits or accepts it. */
  defaultValue?: unknown;
  options?: FormFieldOption[];
  min?: number;
  max?: number;
  step?: number;
}

export interface InputFormSpec {
  title: string;
  description?: string;
  submitLabel?: string;
  fields: FormField[];
}

/** A rendered display component, persisted in aiMessages.metadata.uiBlocks. */
export interface UiBlock {
  id: string;
  component: string;
  props: Record<string, unknown>;
}

/** Persisted state for a turn paused awaiting form input (mirrors PauseState). */
export interface InputRequestState {
  assistantBlocks: unknown[];
  completedResults: unknown[];
  /** The request_* tool_use id the submitted form will answer on resume. */
  inputToolUseId: string;
  spec: InputFormSpec;
}

/**
 * Display tool names. Populated incrementally by later plans; the membership
 * is the single source for the chat-stream `ui_component` emit and the
 * read-classification test. Keep in sync with the FINANCIAL_TOOLS additions.
 */
export const DISPLAY_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  // Plan 2 (data-bound): show_metric_card, show_kpi_grid, show_line_chart,
  //   show_bar_chart, show_area_chart, show_data_table, show_runway,
  //   show_cap_table, show_scenario_diff, show_burn_breakdown, show_funding_summary
  "show_metric_card",
  "show_kpi_grid",
  "show_line_chart",
  "show_bar_chart",
  "show_area_chart",
  "show_runway",
  "show_cap_table",
  "show_scenario_diff",
  // Plan 3 (presentational): show_callout, show_comparison_table, show_checklist,
  //   show_suggested_actions, show_progress_steps
]);

/** Input tool names. request_* presets are added in Plan 4. */
export const INPUT_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  "request_input_form",
]);

export function isDisplayTool(toolName: string): boolean {
  return DISPLAY_TOOL_NAMES.has(toolName);
}

export function isInputTool(toolName: string): boolean {
  return INPUT_TOOL_NAMES.has(toolName);
}

const FIELD_TYPES = new Set<FormFieldType>([
  "currency", "percent", "number", "integer", "text", "select", "date", "date_range",
]);

function coerceField(raw: unknown): FormField | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || typeof r.label !== "string") return null;
  if (typeof r.type !== "string" || !FIELD_TYPES.has(r.type as FormFieldType)) return null;
  const field: FormField = { name: r.name, type: r.type as FormFieldType, label: r.label };
  if (typeof r.placeholder === "string") field.placeholder = r.placeholder;
  if (typeof r.hint === "string") field.hint = r.hint;
  if (typeof r.required === "boolean") field.required = r.required;
  if (r.defaultValue !== undefined) field.defaultValue = r.defaultValue;
  if (Array.isArray(r.options)) {
    field.options = r.options
      .filter((o): o is FormFieldOption =>
        !!o && typeof o === "object" &&
        typeof (o as FormFieldOption).value === "string" &&
        typeof (o as FormFieldOption).label === "string")
      .map((o) => ({ value: o.value, label: o.label }));
  }
  if (typeof r.min === "number") field.min = r.min;
  if (typeof r.max === "number") field.max = r.max;
  if (typeof r.step === "number") field.step = r.step;
  return field;
}

/**
 * Build the form spec for an input tool from the model's tool input.
 * `request_input_form` is a passthrough (model supplies the whole spec).
 * Preset tools (request_revenue_stream, …) are registered in Plan 4.
 */
export function buildInputFormSpec(
  toolName: string,
  input: Record<string, unknown>
): InputFormSpec {
  if (toolName === "request_input_form") {
    const fields = Array.isArray(input.fields)
      ? input.fields.map(coerceField).filter((f): f is FormField => f !== null)
      : [];
    return {
      title: typeof input.title === "string" ? input.title : "Provide details",
      description: typeof input.description === "string" ? input.description : undefined,
      submitLabel: typeof input.submitLabel === "string" ? input.submitLabel : undefined,
      fields,
    };
  }
  throw new Error(`unknown input tool: ${toolName}`);
}
