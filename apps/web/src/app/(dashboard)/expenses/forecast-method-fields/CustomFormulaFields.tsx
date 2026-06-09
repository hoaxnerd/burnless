"use client";

/**
 * Sub-form for `custom_formula` forecast method.
 * Engine fields: { expression, variables? }. NOT `formula`.
 *
 * Variables are typed as a JSON object of NUMERIC named constants (Phase 4
 * §4.6 — engine `CustomFormulaParams.variables` is `Record<string, number>`).
 * We let the user type free-form JSON and parse on blur, rejecting non-number
 * values inline. Available line names are surfaced via a datalist + hint so the
 * expression can reference other lines by name (`CloudCosts * 2`).
 */

import { useState } from "react";
import { Input, Textarea } from "@/components/ui";
import { toUserMessage } from "@/lib/api-error";

interface CustomFormulaParams {
  expression: string;
  // Phase 4 §4.6: numeric only — matches engine `Record<string, number>`.
  variables?: Record<string, number>;
}

interface CustomFormulaFieldsProps {
  params: CustomFormulaParams;
  onChange: (next: CustomFormulaParams) => void;
  disabled?: boolean;
  /** Names of OTHER forecast lines the expression may reference (minus self). */
  availableLineNames?: string[];
}

function stringifyVars(v?: Record<string, number>): string {
  if (!v || Object.keys(v).length === 0) return "";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return "";
  }
}

export function CustomFormulaFields({
  params,
  onChange,
  disabled = false,
  availableLineNames = [],
}: CustomFormulaFieldsProps) {
  // Edit buffer for the variables JSON; committed to parent on blur.
  // Method-switch in the parent form unmounts this component, so we don't
  // need a resync effect — initial state captures whatever params arrive.
  const [varsText, setVarsText] = useState<string>(() => stringifyVars(params.variables));
  const [varsError, setVarsError] = useState<string | null>(null);

  function commitVars(text: string) {
    if (text.trim() === "") {
      setVarsError(null);
      const { variables: _v, ...rest } = params;
      void _v;
      onChange({ ...rest });
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setVarsError("Variables must be a JSON object.");
        return;
      }
      // Variables are numeric named constants (engine `Record<string, number>`).
      // Reject any non-number value; coerce nothing silently. [Phase 4 §4.6]
      for (const v of Object.values(parsed)) {
        if (typeof v !== "number" || !Number.isFinite(v)) {
          setVarsError("Each variable value must be a number.");
          return;
        }
      }
      setVarsError(null);
      onChange({ ...params, variables: parsed as Record<string, number> });
    } catch (e) {
      // JSON.parse SyntaxError — surface a clean, user-safe message (never the
      // raw machine-y parser text). [ERR-02]
      setVarsError(toUserMessage(e) || "Invalid JSON");
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="cf-expr" className="block text-sm font-medium text-surface-700 mb-1">
          Expression
        </label>
        <Input
          id="cf-expr"
          type="text"
          value={params.expression}
          disabled={disabled}
          list={availableLineNames.length > 0 ? "cf-line-names" : undefined}
          onChange={(e) => onChange({ ...params, expression: e.target.value })}
          placeholder="Revenue * 0.3 + 1000"
        />
        {availableLineNames.length > 0 && (
          <datalist id="cf-line-names">
            {availableLineNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        )}
        <p className="mt-1 text-xs text-surface-500">
          Reference other lines by name; use offsets like <code>Foo[-1]</code> for prior month.
        </p>
        {availableLineNames.length > 0 && (
          <p className="mt-1 text-xs text-surface-400">
            Available lines: {availableLineNames.join(", ")}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="cf-vars" className="block text-sm font-medium text-surface-700 mb-1">
          Variables JSON <span className="text-surface-400 font-normal">(optional)</span>
        </label>
        <Textarea
          id="cf-vars"
          rows={3}
          value={varsText}
          disabled={disabled}
          onChange={(e) => setVarsText(e.target.value)}
          onBlur={(e) => commitVars(e.target.value)}
          className="font-mono"
          placeholder='{ "x": 1, "y": 2 }'
        />
        {varsError && (
          <p className="mt-1.5 text-xs font-medium text-danger-600" role="alert">
            {varsError}
          </p>
        )}
      </div>
    </div>
  );
}
