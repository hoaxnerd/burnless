"use client";

import { useState } from "react";
import {
  CurrencyInput,
  PercentageInput,
  NumberInput,
  SingleDateInput,
  DateRangePicker,
} from "@/components/forms/primitives";
import { Button } from "@/components/ui/button";
import type { PendingInput, PendingInputField } from "../types";

export interface InputFormCardProps {
  pending: PendingInput;
  onSubmit: (data: Record<string, unknown>) => void;
  disabled: boolean;
}

function initialValue(f: PendingInputField): unknown {
  if (f.defaultValue !== undefined) return f.defaultValue;
  if (f.type === "currency" || f.type === "percent") return 0;
  if (f.type === "number" || f.type === "integer") return null;
  if (f.type === "date_range") return { startDate: "", endDate: null };
  return "";
}

export function InputFormCard({ pending, onSubmit, disabled }: InputFormCardProps) {
  const { spec } = pending;
  const resolved = !!pending.resolved;
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const v: Record<string, unknown> = {};
    for (const f of spec.fields) v[f.name] = initialValue(f);
    return v;
  });
  const [error, setError] = useState<string | null>(null);
  const set = (name: string, val: unknown) => setValues((s) => ({ ...s, [name]: val }));

  function submit() {
    const missing = spec.fields
      .filter((f) => f.required)
      .filter((f) => {
        const v = values[f.name];
        return v === undefined || v === null || v === "";
      });
    if (missing.length) {
      setError(`${missing[0]!.label} is required.`);
      return;
    }
    setError(null);
    onSubmit(values);
  }

  return (
    <div className="my-2 rounded-xl border border-surface-200 bg-surface-0 p-4">
      <p className="text-sm font-semibold text-surface-900">{spec.title}</p>
      {spec.description ? (
        <p className="mt-0.5 text-xs text-surface-500">{spec.description}</p>
      ) : null}
      <div className="mt-3 flex flex-col gap-3">
        {spec.fields.map((f) => (
          <FieldInput
            key={f.name}
            field={f}
            value={values[f.name]}
            onChange={(v) => set(f.name, v)}
            disabled={disabled || resolved}
          />
        ))}
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      <div className="mt-3 flex justify-end">
        <Button onClick={submit} disabled={disabled || resolved}>
          {resolved ? "Submitted" : (spec.submitLabel ?? "Submit")}
        </Button>
      </div>
    </div>
  );
}

function FieldInput({
  field: f,
  value,
  onChange,
  disabled,
}: {
  field: PendingInputField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled: boolean;
}) {
  switch (f.type) {
    case "currency":
      return (
        <CurrencyInput
          label={f.label}
          value={Number(value ?? 0)}
          onChange={onChange}
          required={f.required}
          disabled={disabled}
          hint={f.hint}
          min={f.min}
          step={f.step}
        />
      );
    case "percent":
      return (
        <PercentageInput
          label={f.label}
          value={Number(value ?? 0)}
          onChange={onChange}
          required={f.required}
          disabled={disabled}
          hint={f.hint}
          min={f.min}
          max={f.max}
          step={f.step}
        />
      );
    case "number":
    case "integer":
      return (
        <NumberInput
          label={f.label}
          value={(value as number | null) ?? null}
          onChange={onChange}
          required={f.required}
          disabled={disabled}
          hint={f.hint}
          min={f.min}
          max={f.max ?? null}
          step={f.step}
          integerOnly={f.type === "integer"}
        />
      );
    case "date":
      return (
        <SingleDateInput
          label={f.label}
          value={String(value ?? "")}
          onChange={onChange}
          required={f.required}
          disabled={disabled}
          hint={f.hint}
        />
      );
    case "date_range": {
      const v =
        (value as { startDate: string; endDate: string | null }) ?? {
          startDate: "",
          endDate: null,
        };
      return (
        <DateRangePicker
          startDate={v.startDate}
          endDate={v.endDate}
          onChange={onChange}
          required={f.required}
          disabled={disabled}
          hint={f.hint}
        />
      );
    }
    case "select":
      return (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-700">
            {f.label}
            {f.required ? " *" : ""}
          </span>
          <select
            className="rounded-lg border border-surface-200 px-2 py-1.5"
            value={String(value ?? "")}
            disabled={disabled}
            aria-label={f.label}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="" disabled>
              Select…
            </option>
            {(f.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {f.hint ? <span className="text-xs text-surface-500">{f.hint}</span> : null}
        </label>
      );
    default:
      return (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-700">
            {f.label}
            {f.required ? " *" : ""}
          </span>
          <input
            className="rounded-lg border border-surface-200 px-2 py-1.5"
            type="text"
            value={String(value ?? "")}
            placeholder={f.placeholder}
            disabled={disabled}
            aria-label={f.label}
            onChange={(e) => onChange(e.target.value)}
          />
          {f.hint ? <span className="text-xs text-surface-500">{f.hint}</span> : null}
        </label>
      );
  }
}
