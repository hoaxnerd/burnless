"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { Input, Select } from "@/components/ui";
import { apiFetch } from "@/lib/api-fetch";
import { STAGE_OPTIONS, MODEL_OPTIONS } from "../../constants";
import type { WizardStepHandle } from "../types";

export interface CompanyValues {
  company_name: string;
  stage: string;
  business_model: string;
  industry: string;
  founders: string[];
  user_name: string;
}

interface CompanyStepProps {
  initial?: Partial<CompanyValues>;
  onCreated: (companyId: string) => void;
}

const DEFAULTS: CompanyValues = {
  company_name: "",
  stage: STAGE_OPTIONS[0] ?? "Pre-seed",
  business_model: MODEL_OPTIONS[0] ?? "SaaS",
  industry: "",
  founders: [],
  user_name: "",
};

/**
 * Wizard step 1 — the only step that creates the company. Its `submit()` POSTs
 * the slim `/api/onboarding` (company + base scenario + default accounts +
 * departments) and calls `onCreated(companyId)` so the orchestrator can advance
 * to Revenue. Company name is required: `submit()` returns false (with an inline
 * error) when empty or when the POST errors, and true on success / 409
 * already-complete. The global shell Continue drives `submit()` via a ref — this
 * step renders ONLY the fields, no Continue of its own.
 * Spec: docs/superpowers/specs/2026-06-12-s4b-onboarding-wizard-design.md §5 (step 1).
 */
export const CompanyStep = forwardRef<WizardStepHandle, CompanyStepProps>(
  function CompanyStep({ initial, onCreated }, ref) {
  const [values, setValues] = useState<CompanyValues>({
    ...DEFAULTS,
    ...initial,
  });
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof CompanyValues>(key: K, v: CompanyValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const handleContinue = async (): Promise<boolean> => {
    if (submitting) return false;
    const name = values.company_name.trim();
    if (!name) {
      setNameError("Company name is required");
      return false;
    }
    setNameError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: name,
          stage: values.stage,
          business_model: values.business_model,
          industry: values.industry || undefined,
          user_name: values.user_name || undefined,
          founders: values.founders,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          companyId?: string;
        };
        // Back → Company → Continue re-confirm: the company already exists.
        // Treat it as success and advance with the existing companyId.
        if (res.status === 409 && body.code === "ONBOARDING_ALREADY_COMPLETE" && body.companyId) {
          onCreated(body.companyId);
          return true;
        }
        throw new Error(
          body.error ?? "Could not create your company. Please try again.",
        );
      }
      const { companyId } = (await res.json()) as { companyId: string };
      onCreated(companyId);
      return true;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not create your company. Please try again.");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  useImperativeHandle(ref, () => ({ submit: handleContinue }));

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
          Your company
        </h2>
        <p className="text-sm text-surface-500 dark:text-surface-400">
          Tell us the basics. We&apos;ll set up your workspace from here.
        </p>
      </div>

      <div className="space-y-4">
        <Input
          label="Company name"
          required
          value={values.company_name}
          placeholder="My Startup Inc."
          error={nameError ?? undefined}
          onChange={(e) => {
            set("company_name", e.target.value);
            if (nameError) setNameError(null);
          }}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Stage"
            value={values.stage}
            onChange={(e) => set("stage", e.target.value)}
          >
            {STAGE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
          <Select
            label="Business model"
            value={values.business_model}
            onChange={(e) => set("business_model", e.target.value)}
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </div>

        <Input
          label="Industry"
          showOptional
          value={values.industry}
          placeholder="Fintech"
          onChange={(e) => set("industry", e.target.value)}
        />

        <Input
          label="Your name"
          showOptional
          value={values.user_name}
          placeholder="E.g. Jane Doe"
          onChange={(e) => set("user_name", e.target.value)}
        />
      </div>

      {submitError && (
        <p className="text-sm font-medium text-danger-600 dark:text-danger-400">{submitError}</p>
      )}
    </div>
  );
});
