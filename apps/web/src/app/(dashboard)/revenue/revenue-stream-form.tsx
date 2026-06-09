"use client";

import { useState, type FormEvent } from "react";
import { Input, Select, Button } from "@/components/ui";
import { DateRangePicker } from "@/components/forms/primitives";
import {
  defaultParamsForType,
  type RevenueStreamType,
} from "@/lib/revenue-params";
import { SubscriptionFields } from "./stream-fields/SubscriptionFields";
import { OneTimeFields } from "./stream-fields/OneTimeFields";
import { UsageFields } from "./stream-fields/UsageFields";
import { ServicesFields } from "./stream-fields/ServicesFields";
import { MarketplaceFields } from "./stream-fields/MarketplaceFields";
import { EcommerceFields } from "./stream-fields/EcommerceFields";
import { HardwareFields } from "./stream-fields/HardwareFields";

export interface RevenueStreamFormValues {
  name: string;
  type: RevenueStreamType;
  startDate: string;
  endDate: string | null;
  parameters: Record<string, unknown>;
}

export interface RevenueStreamFormProps {
  mode: "add" | "edit";
  initial?: Partial<RevenueStreamFormValues>;
  onSubmit: (values: RevenueStreamFormValues) => void | Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
}

const TYPE_LABELS: Record<RevenueStreamType, string> = {
  subscription: "Subscription (SaaS / recurring)",
  one_time: "One-time / non-recurring",
  usage_based: "Usage-based / consumption",
  services: "Services / consulting",
  marketplace: "Marketplace (GMV × take rate)",
  ecommerce: "E-commerce (orders × AOV)",
  hardware: "Hardware (units × price)",
};

const today = new Date().toISOString().slice(0, 10);

export function RevenueStreamForm({
  mode,
  initial,
  onSubmit,
  onCancel,
  submitting,
}: RevenueStreamFormProps) {
  const [values, setValues] = useState<RevenueStreamFormValues>(() => {
    const type = (initial?.type ?? "subscription") as RevenueStreamType;
    return {
      name: initial?.name ?? "",
      type,
      startDate: initial?.startDate ?? today,
      endDate: initial?.endDate ?? null,
      parameters: initial?.parameters ?? defaultParamsForType(type),
    };
  });

  const setType = (next: RevenueStreamType) =>
    setValues((v) => ({ ...v, type: next, parameters: defaultParamsForType(next) }));

  const setParameters = (
    updater: (prev: Record<string, unknown>) => Record<string, unknown>,
  ) => setValues((v) => ({ ...v, parameters: updater(v.parameters) }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit(values);
  }

  const fp = { params: values.parameters, setParams: setParameters };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      aria-label={mode === "add" ? "Add revenue stream" : "Edit revenue stream"}
    >
      <Input
        type="text"
        label="Name"
        required
        value={values.name}
        onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        aria-label="Revenue stream name"
      />

      <Select
        label="Type"
        required
        value={values.type}
        onChange={(e) => setType(e.target.value as RevenueStreamType)}
        aria-label="Revenue stream type"
      >
        {(Object.keys(TYPE_LABELS) as RevenueStreamType[]).map((t) => (
          <option key={t} value={t}>
            {TYPE_LABELS[t]}
          </option>
        ))}
      </Select>

      <DateRangePicker
        startDate={values.startDate}
        endDate={values.endDate}
        onChange={({ startDate, endDate }) =>
          setValues((v) => ({ ...v, startDate, endDate }))
        }
      />

      {values.type === "subscription" && <SubscriptionFields {...fp} />}
      {values.type === "one_time" && <OneTimeFields {...fp} />}
      {values.type === "usage_based" && <UsageFields {...fp} />}
      {values.type === "services" && <ServicesFields {...fp} />}
      {values.type === "marketplace" && <MarketplaceFields {...fp} />}
      {values.type === "ecommerce" && <EcommerceFields {...fp} />}
      {values.type === "hardware" && <HardwareFields {...fp} />}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" state={submitting ? "loading" : "idle"}>
          {mode === "add" ? "Add stream" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
