"use client";
import { InputFormCard } from "../../generative/input-form-card";
import type { PendingInput } from "../../types";

/** A genui input-form pause, rendered in-stream as a worklog node. */
export function InputNode({
  pending,
  disabled,
  onSubmit,
}: {
  pending: PendingInput;
  disabled: boolean;
  onSubmit: (pending: PendingInput, data: Record<string, unknown>) => void;
}) {
  return <InputFormCard pending={pending} disabled={disabled} onSubmit={(data) => onSubmit(pending, data)} />;
}
