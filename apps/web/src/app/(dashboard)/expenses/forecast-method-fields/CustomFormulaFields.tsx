"use client";

/**
 * Sub-form for `custom_formula` forecast method.
 * Engine fields: { expression, variables? }. NOT `formula`.
 *
 * Variables are typed as a JSON object with number/string values; we let the
 * user type free-form JSON and parse on blur, surfacing the error inline.
 */

import { useState } from "react";
import { Input, Textarea } from "@/components/ui";
import { toUserMessage } from "@/lib/api-error";

interface CustomFormulaParams {
  expression: string;
  variables?: Record<string, number | string>;
}

interface CustomFormulaFieldsProps {
  params: CustomFormulaParams;
  onChange: (next: CustomFormulaParams) => void;
  disabled?: boolean;
}

function stringifyVars(v?: Record<string, number | string>): string {
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
      // Validate value types; coerce nothing silently.
      for (const v of Object.values(parsed)) {
        if (typeof v !== "number" && typeof v !== "string") {
          setVarsError("Each variable value must be a number or string.");
          return;
        }
      }
      setVarsError(null);
      onChange({ ...params, variables: parsed as Record<string, number | string> });
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
          onChange={(e) => onChange({ ...params, expression: e.target.value })}
          placeholder="Revenue * 0.3 + 1000"
        />
        <p className="mt-1 text-xs text-surface-500">
          Reference other lines by name; use offsets like <code>Foo[-1]</code> for prior month.
        </p>
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
