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
  /** Binary model confidence in this result (spec §4.3); populated in Plan 5. */
  confidence?: "high" | "low";
  /** One-line "because you said X" rationale (spec §4.3); populated in Plan 5. */
  rationale?: string;
}

/**
 * The envelope a display tool's handler returns (spec §4.3). `render` carries the
 * component + props to display; `modelResult` is the terse string handed back to
 * the model. `confidence`/`rationale` are optional binary-confidence plumbing
 * (the model populates them via the Plan 5 prompt convention).
 */
export interface GenuiResultEnvelope {
  render?: { component: string; props: Record<string, unknown> };
  modelResult?: string;
  confidence?: "high" | "low";
  rationale?: string;
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
  "show_burn_breakdown",
  "show_funding_summary",
  "show_data_table",
  // Plan 3 (presentational): show_callout, show_comparison_table, show_checklist,
  //   show_suggested_actions, show_progress_steps
  "show_callout",
  "show_comparison_table",
  "show_checklist",
  "show_suggested_actions",
  "show_progress_steps",
  // Scheduling proposal card (MCP-D): renders the AI's draft scheduled job; the
  // tool input IS the card props (passthrough handler in genui-display.ts).
  "propose_scheduled_job",
]);

/** Input tool names. request_* presets are added in Plan 4. */
export const INPUT_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  "request_input_form",
  "request_revenue_stream",
  "request_headcount",
  "request_forecast_line",
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
 * Preset field-sets. Field `name`s map to the matching create tool's args
 * (create_revenue_stream / create_headcount / create_forecast_line) so the
 * model's follow-up write call is mechanical.
 */
const PRESET_FIELDS: Record<string, FormField[]> = {
  request_revenue_stream: [
    { name: "name", type: "text", label: "Stream name", required: true, placeholder: "e.g. Pro Plan" },
    { name: "type", type: "select", label: "Type", required: true,
      options: [
        { value: "subscription", label: "Subscription" },
        { value: "one_time", label: "One-time" },
        { value: "usage_based", label: "Usage-based" },
        { value: "services", label: "Services" },
      ] },
    { name: "monthlyAmount", type: "currency", label: "Monthly amount", required: true, min: 0 },
    { name: "startDate", type: "date", label: "Start date", required: true },
  ],
  request_headcount: [
    { name: "title", type: "text", label: "Role title", required: true, placeholder: "e.g. Senior Engineer" },
    { name: "salary", type: "currency", label: "Annual salary", required: true, min: 0 },
    { name: "startDate", type: "date", label: "Start date", required: true },
    { name: "count", type: "integer", label: "Headcount", required: true, min: 1, defaultValue: 1 },
  ],
  request_forecast_line: [
    { name: "name", type: "text", label: "Line name", required: true },
    { name: "method", type: "select", label: "Method", required: true,
      options: [
        { value: "fixed", label: "Fixed" },
        { value: "growth_rate", label: "Growth rate" },
        { value: "per_unit", label: "Per unit" },
        { value: "percentage_of", label: "Percentage of" },
      ] },
    { name: "amount", type: "currency", label: "Base amount", required: true, min: 0 },
    { name: "startDate", type: "date", label: "Start date", required: true },
  ],
};

function applyDefaults(fields: FormField[], defaults: Record<string, unknown> | undefined): FormField[] {
  if (!defaults) return fields.map((f) => ({ ...f }));
  return fields.map((f) => (defaults[f.name] !== undefined ? { ...f, defaultValue: defaults[f.name] } : { ...f }));
}

/**
 * Build the form spec for an input tool from the model's tool input.
 * `request_input_form` is a passthrough (model supplies the whole spec).
 * Preset tools (request_revenue_stream, …) expand to a fixed field-set with
 * model-proposed `defaults` applied.
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
  const preset = PRESET_FIELDS[toolName];
  if (preset) {
    const defaults = (input.defaults && typeof input.defaults === "object")
      ? (input.defaults as Record<string, unknown>) : undefined;
    const TITLES: Record<string, string> = {
      request_revenue_stream: "Add a revenue stream",
      request_headcount: "Add a hire",
      request_forecast_line: "Add a forecast line",
    };
    return {
      title: typeof input.title === "string" ? input.title : TITLES[toolName]!,
      description: typeof input.description === "string" ? input.description : undefined,
      submitLabel: typeof input.submitLabel === "string" ? input.submitLabel : "Save",
      fields: applyDefaults(preset, defaults),
    };
  }
  throw new Error(`unknown input tool: ${toolName}`);
}

// ── Plan pause (spec 2026-06-07 §4.1) ────────────────────────────────────────

export type PlanStepKind = "tool" | "note";

/**
 * One proposed step. `tool` steps name the tool the model intends to call (the
 * model still calls it itself after the plan is approved — the step is advisory
 * intent, not an execution instruction). `note` steps are free-text.
 * `confidence`/`rationale` are surfaced in the UI in later plans.
 */
export interface PlanStep {
  id: string;
  kind: PlanStepKind;
  /** Human-readable label for the step. */
  title: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  rationale?: string;
  confidence?: "high" | "low";
}

export interface PlanSpec {
  title: string;
  description?: string;
  steps: PlanStep[];
}

/** Persisted state for a turn paused awaiting plan approval (mirrors InputRequestState). */
export interface PlanRequestState {
  assistantBlocks: unknown[];
  completedResults: unknown[];
  /** The propose_plan tool_use id the approved plan answers on resume. */
  planToolUseId: string;
  spec: PlanSpec;
}

/** Plan/control tool names. The model calls these to PAUSE for plan approval. */
export const PLAN_TOOL_NAMES: ReadonlySet<string> = new Set<string>(["propose_plan"]);

export function isPlanTool(toolName: string): boolean {
  return PLAN_TOOL_NAMES.has(toolName);
}

function coercePlanStep(raw: unknown): PlanStep | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== "string") return null;
  const kind: PlanStepKind = r.kind === "tool" ? "tool" : "note";
  // id is carried through if the model supplied a non-empty string; otherwise
  // left as an empty placeholder so buildPlanSpec can assign a positional id.
  const step: PlanStep = {
    id: typeof r.id === "string" ? r.id : "",
    kind,
    title: r.title,
  };
  if (typeof r.toolName === "string") step.toolName = r.toolName;
  if (r.toolInput && typeof r.toolInput === "object") step.toolInput = r.toolInput as Record<string, unknown>;
  if (typeof r.rationale === "string") step.rationale = r.rationale;
  if (r.confidence === "high" || r.confidence === "low") step.confidence = r.confidence;
  return step;
}

/**
 * Build the plan spec from the model's `propose_plan` tool input. Tolerant:
 * coerces/drops malformed steps and defaults the title (the model's structured
 * output is not guaranteed well-formed).
 *
 * Step ids are positional and deterministic per spec: same input always
 * produces the same ids (step-1, step-2, …), regardless of call order or
 * process lifetime. A model-provided non-empty string id is preserved as-is.
 */
export function buildPlanSpec(
  toolName: string,
  input: Record<string, unknown>
): PlanSpec {
  if (toolName !== "propose_plan") {
    throw new Error(`unknown plan tool: ${toolName}`);
  }
  const steps = (Array.isArray(input.steps) ? input.steps : [])
    .map(coercePlanStep)
    .filter((s): s is PlanStep => s !== null)
    .map((s, i) => ({ ...s, id: s.id && s.id.length > 0 ? s.id : `step-${i + 1}` }));
  return {
    title: typeof input.title === "string" ? input.title : "Plan",
    description: typeof input.description === "string" ? input.description : undefined,
    steps,
  };
}

// ── Typed-node timeline (spec 2026-06-07 §4.5) ───────────────────────────────

export type TimelineNodeKind = "plan" | "tool" | "diff_gate" | "result" | "input" | "scenario";

/** Rich gate payloads persisted inline on a TimelineNode (Plan 5) so a reloaded
 *  run reconstructs the plan/diff/input gate WITHOUT the live pending row. Shapes
 *  mirror the client PendingPlan/PendingPermission/PendingInput so persisted JSON
 *  renders directly. */
export interface TimelineGatePlan { pauseId: string; conversationId: string; spec: PlanSpec; resolved?: boolean; }
export interface TimelineGateInput { pauseId: string; conversationId: string; spec: InputFormSpec; resolved?: boolean; }
export interface TimelineGatePermission { pauseId: string; conversationId: string; actions: unknown[]; resolved?: boolean; }

/**
 * One node in an assistant turn's worklog. The ordered `TimelineNode[]` is the
 * presentation model for the agentic timeline — accumulated from StreamChunks on
 * the client and persisted to aiMessages.metadata.timeline so reload reconstructs
 * the full run. `plan`/`diff_gate`/`input` carry their pause payload by reference
 * (pauseId) so the existing pause/resume machinery is unchanged; `tool` tracks a
 * live tool invocation; `result` is a rendered output (text and/or a UiBlock).
 */
export interface TimelineNode {
  /** Stable id correlating status→result. tool nodes use the tool_use id. */
  id: string;
  kind: TimelineNodeKind;
  // ── tool node ──
  toolName?: string;
  phase?: "pending" | "running" | "done" | "error";
  // ── result node ──
  /** Streamed assistant prose for a text result node. */
  text?: string;
  /** A rendered genui block for a component result node. */
  block?: UiBlock;
  confidence?: "high" | "low";
  rationale?: string;
  // ── plan / diff_gate / input nodes ── (payload lives on the pending row;
  //    the client hydrates these from the SSE pause events by pauseId)
  pauseId?: string;
  // ── gate nodes (Plan 5: rich payload persisted for reload) ──
  plan?: TimelineGatePlan;
  pending?: TimelineGatePermission;
  input?: TimelineGateInput;
  /** Set once a gate has been decided (historical render). */
  resolved?: boolean;
  // ── scenario marker node (Plan 5) ──
  scenarioId?: string;
  /** null marks an exit-to-base scenario node; the client will render it as
   *  "Exited scenario" (client handling lands in the follow-up client task). */
  scenarioName?: string | null;
}
