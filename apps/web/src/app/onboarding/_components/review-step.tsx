import { ArrowRight, SkipForward } from "lucide-react";
import type { CompanyFields } from "./types";
import { FIELD_LABELS, FIELD_PLACEHOLDERS, STAGE_OPTIONS, MODEL_OPTIONS } from "./constants";
import { ConfidenceBadge } from "./confidence-badge";
import { FormField } from "./form-field";

interface ReviewStepProps {
  fields: CompanyFields;
  createError: string | null;
  onUpdateField: (name: keyof CompanyFields, value: string) => void;
  onCreate: () => void;
  onSkipOnboarding: () => void;
}

export function ReviewStep({
  fields,
  createError,
  onUpdateField,
  onCreate,
  onSkipOnboarding,
}: ReviewStepProps) {
  const aiFieldCount = Object.values(fields).filter(
    (f) => f.source === "ai"
  ).length;

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 py-12 px-4">
      <div className="max-w-lg mx-auto animate-slide-up">
        {/* Progress indicator */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-8 rounded-full bg-brand-600" />
              <div className="h-2 w-8 rounded-full bg-brand-600" />
              <div className="h-2 w-8 rounded-full bg-surface-200 dark:bg-surface-700" />
            </div>
            <span className="text-xs font-medium text-surface-500 dark:text-surface-400">
              Step 2 of 3
            </span>
          </div>
          <button
            onClick={onSkipOnboarding}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Skip all
          </button>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">
            {aiFieldCount > 0
              ? "Verify your details"
              : "Tell us about your company"}
          </h1>
          <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
            {aiFieldCount > 0
              ? `We found ${aiFieldCount} field${aiFieldCount !== 1 ? "s" : ""} — verify and fill in the rest.`
              : "Fill in what you know — you can always update later."}
          </p>
        </div>

        {createError && (
          <div className="mb-6 rounded-xl bg-danger-50 dark:bg-danger-950 border border-danger-500/20 p-4 text-sm text-danger-700 dark:text-danger-500">
            {createError}
          </div>
        )}

        <div className="space-y-4">
          {/* Company Name — required */}
          <FormField
            label={FIELD_LABELS.company_name}
            field={fields.company_name}
            placeholder={FIELD_PLACEHOLDERS.company_name}
            onChange={(v) => onUpdateField("company_name", v)}
            required
            badge={<ConfidenceBadge {...fields.company_name} />}
          />

          {/* Stage — select */}
          <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
                {FIELD_LABELS.stage}
              </label>
              <ConfidenceBadge {...fields.stage} />
            </div>
            <div className="flex flex-wrap gap-2">
              {STAGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  onClick={() => onUpdateField("stage", option)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    fields.stage.value === option
                      ? "bg-brand-600 text-white"
                      : "bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-600"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* Business Model — select */}
          <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
                {FIELD_LABELS.business_model}
              </label>
              <ConfidenceBadge {...fields.business_model} />
            </div>
            <div className="flex flex-wrap gap-2">
              {MODEL_OPTIONS.map((option) => (
                <button
                  key={option}
                  onClick={() => onUpdateField("business_model", option)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    fields.business_model.value === option
                      ? "bg-brand-600 text-white"
                      : "bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-600"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* Text fields */}
          <FormField
            label={FIELD_LABELS.industry}
            field={fields.industry}
            placeholder={FIELD_PLACEHOLDERS.industry}
            onChange={(v) => onUpdateField("industry", v)}
            badge={<ConfidenceBadge {...fields.industry} />}
          />
          <FormField
            label={FIELD_LABELS.monthly_revenue}
            field={fields.monthly_revenue}
            placeholder={FIELD_PLACEHOLDERS.monthly_revenue}
            onChange={(v) => onUpdateField("monthly_revenue", v)}
            badge={<ConfidenceBadge {...fields.monthly_revenue} />}
          />
          <FormField
            label={FIELD_LABELS.team_size}
            field={fields.team_size}
            placeholder={FIELD_PLACEHOLDERS.team_size}
            onChange={(v) => onUpdateField("team_size", v)}
            badge={<ConfidenceBadge {...fields.team_size} />}
          />
          <FormField
            label={FIELD_LABELS.funding}
            field={fields.funding}
            placeholder={FIELD_PLACEHOLDERS.funding}
            onChange={(v) => onUpdateField("funding", v)}
            badge={<ConfidenceBadge {...fields.funding} />}
          />
          <FormField
            label={FIELD_LABELS.main_expenses}
            field={fields.main_expenses}
            placeholder={FIELD_PLACEHOLDERS.main_expenses}
            onChange={(v) => onUpdateField("main_expenses", v)}
            badge={<ConfidenceBadge {...fields.main_expenses} />}
          />
        </div>

        <button
          onClick={onCreate}
          className="mt-8 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-4 text-base font-medium text-white hover:bg-brand-700 transition-colors"
        >
          Create My Company
          <ArrowRight className="w-5 h-5" />
        </button>

        <button
          onClick={onSkipOnboarding}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-surface-200 dark:border-surface-700 px-6 py-3 text-sm font-medium text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
        >
          I&apos;ll do this later
        </button>

        <p className="mt-3 text-center text-xs text-surface-400">
          You can always fill this in from Settings.
        </p>
      </div>
    </div>
  );
}
