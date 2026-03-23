import { useState } from "react";
import { ArrowRight, Building2, DollarSign, Users, SkipForward, Sparkles, AlertTriangle, RotateCcw } from "lucide-react";
import type { CompanyFields } from "./types";
import { FIELD_LABELS, FIELD_PLACEHOLDERS, STAGE_OPTIONS, MODEL_OPTIONS } from "./constants";
import { ConfidenceBadge } from "./confidence-badge";


interface ReviewStepProps {
  fields: CompanyFields;
  createError: string | null;
  onUpdateField: (name: keyof CompanyFields, value: string) => void;
  onCreate: () => void;
  onSkipOnboarding: () => void;
}

function SectionCard({
  icon: Icon,
  title,
  children,
  delay = 0,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <div
      className="rounded-2xl bg-surface-0 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700 p-5 animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400">
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function ToggleGroup({
  label,
  options,
  value,
  onChange,
  badge,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  badge?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
          {label}
        </label>
        {badge}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              value === option
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-600"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function InlineField({
  label,
  field,
  placeholder,
  onChange,
  required,
  badge,
  type = "text",
  min,
  step,
  prefix,
  error,
  onBlur,
}: {
  label: string;
  field: { value: string; source: string };
  placeholder: string;
  onChange: (v: string) => void;
  required?: boolean;
  badge?: React.ReactNode;
  type?: "text" | "number";
  min?: string;
  step?: string;
  prefix?: string;
  error?: string;
  onBlur?: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
          {label}
          {required && <span className="text-danger-500 ml-0.5">*</span>}
        </label>
        {badge}
      </div>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-surface-400">
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={field.value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          min={min}
          step={step}
          className={`w-full rounded-lg border bg-surface-0 dark:bg-surface-900 ${prefix ? "pl-7" : "px-3"} ${!prefix ? "px-3" : "pr-3"} py-2 text-sm text-surface-900 dark:text-surface-50 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors ${
            error
              ? "border-danger-500"
              : field.source === "ai"
                ? "border-accent-300 dark:border-accent-700"
                : "border-surface-300 dark:border-surface-600"
          }`}
        />
      </div>
      {error && (
        <p className="mt-1 text-xs text-danger-500">{error}</p>
      )}
    </div>
  );
}

export function ReviewStep({
  fields,
  createError,
  onUpdateField,
  onCreate,
  onSkipOnboarding,
}: ReviewStepProps) {
  const [nameBlurred, setNameBlurred] = useState(false);
  const nameError = nameBlurred && !fields.company_name.value.trim()
    ? "Company name is required"
    : undefined;

  const aiFieldCount = Object.values(fields).filter(
    (f) => f.source === "ai"
  ).length;

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Progress indicator */}
        <div className="flex items-center justify-between mb-8 animate-slide-up">
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

        <div className="text-center mb-8 animate-slide-up" style={{ animationDelay: "50ms" }}>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">
            {aiFieldCount > 0
              ? "Verify your details"
              : "Tell us about your company"}
          </h1>
          <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
            {aiFieldCount > 0 ? (
              <>
                We found {aiFieldCount} field{aiFieldCount !== 1 ? "s" : ""} — just confirm what looks right.
              </>
            ) : (
              "Three quick sections — fill what you know, skip the rest."
            )}
          </p>
          {aiFieldCount > 0 && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-50 dark:bg-accent-950 px-3 py-1 text-xs font-medium text-accent-700 dark:text-accent-400">
              <Sparkles className="w-3 h-3" />
              AI-detected fields have purple borders
            </div>
          )}
        </div>

        {createError && (
          <div className="mb-6 rounded-xl bg-danger-50 dark:bg-danger-950 border border-danger-500/20 p-4 animate-slide-up">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-danger-700 dark:text-danger-400">
                  {createError}
                </p>
                <p className="mt-1 text-xs text-danger-600 dark:text-danger-500">
                  Check your details below and try again. If this keeps happening, skip onboarding and set up your company from Settings.
                </p>
              </div>
            </div>
            <button
              onClick={onCreate}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-danger-700 dark:text-danger-400 bg-danger-100 dark:bg-danger-900/50 hover:bg-danger-200 dark:hover:bg-danger-900 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Retry
            </button>
          </div>
        )}

        <div className="space-y-4">
          {/* Section 1: Company Identity */}
          <SectionCard icon={Building2} title="Company Identity" delay={100}>
            <div className="space-y-3">
              <InlineField
                label={FIELD_LABELS.company_name}
                field={fields.company_name}
                placeholder={FIELD_PLACEHOLDERS.company_name}
                onChange={(v) => onUpdateField("company_name", v)}
                onBlur={() => setNameBlurred(true)}
                required
                error={nameError}
                badge={<ConfidenceBadge {...fields.company_name} />}
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <ToggleGroup
                    label={FIELD_LABELS.stage}
                    options={STAGE_OPTIONS}
                    value={fields.stage.value}
                    onChange={(v) => onUpdateField("stage", v)}
                    badge={<ConfidenceBadge {...fields.stage} />}
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <ToggleGroup
                    label={FIELD_LABELS.business_model}
                    options={MODEL_OPTIONS}
                    value={fields.business_model.value}
                    onChange={(v) => onUpdateField("business_model", v)}
                    badge={<ConfidenceBadge {...fields.business_model} />}
                  />
                </div>
              </div>
              <InlineField
                label={FIELD_LABELS.industry}
                field={fields.industry}
                placeholder={FIELD_PLACEHOLDERS.industry}
                onChange={(v) => onUpdateField("industry", v)}
                badge={<ConfidenceBadge {...fields.industry} />}
              />
            </div>
          </SectionCard>

          {/* Section 2: Financials */}
          <SectionCard icon={DollarSign} title="Financials" delay={200}>
            <div className="grid grid-cols-2 gap-3">
              <InlineField
                label="Monthly Revenue"
                field={fields.monthly_revenue}
                placeholder={FIELD_PLACEHOLDERS.monthly_revenue}
                onChange={(v) => onUpdateField("monthly_revenue", v)}
                badge={<ConfidenceBadge {...fields.monthly_revenue} />}
                type="number"
                min="0"
                step="1"
                prefix="$"
              />
              <InlineField
                label="Funding Raised"
                field={fields.funding}
                placeholder={FIELD_PLACEHOLDERS.funding}
                onChange={(v) => onUpdateField("funding", v)}
                badge={<ConfidenceBadge {...fields.funding} />}
                type="number"
                min="0"
                step="1"
                prefix="$"
              />
            </div>
          </SectionCard>

          {/* Section 3: Team & Operations */}
          <SectionCard icon={Users} title="Team & Operations" delay={300}>
            <div className="grid grid-cols-2 gap-3">
              <InlineField
                label={FIELD_LABELS.team_size}
                field={fields.team_size}
                placeholder={FIELD_PLACEHOLDERS.team_size}
                onChange={(v) => onUpdateField("team_size", v)}
                badge={<ConfidenceBadge {...fields.team_size} />}
                type="number"
                min="0"
                step="1"
              />
              <InlineField
                label="Main Expenses"
                field={fields.main_expenses}
                placeholder={FIELD_PLACEHOLDERS.main_expenses}
                onChange={(v) => onUpdateField("main_expenses", v)}
                badge={<ConfidenceBadge {...fields.main_expenses} />}
              />
            </div>
          </SectionCard>
        </div>

        <button
          onClick={onCreate}
          className="mt-8 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-4 text-base font-medium text-white hover:bg-brand-700 transition-colors press-effect"
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
