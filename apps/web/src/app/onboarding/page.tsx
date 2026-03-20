"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Globe,
  Loader2,
  ArrowRight,
  Check,
  Pencil,
  Sparkles,
  SkipForward,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

type OnboardingStep = "website" | "enriching" | "review" | "creating" | "done";

interface FieldData {
  value: string;
  confidence: "high" | "medium" | "low";
  source: "ai" | "user" | "default";
}

interface CompanyFields {
  company_name: FieldData;
  stage: FieldData;
  business_model: FieldData;
  industry: FieldData;
  monthly_revenue: FieldData;
  team_size: FieldData;
  funding: FieldData;
  main_expenses: FieldData;
}

const FIELD_LABELS: Record<keyof CompanyFields, string> = {
  company_name: "Company Name",
  stage: "Stage",
  business_model: "Business Model",
  industry: "Industry",
  monthly_revenue: "Monthly Revenue",
  team_size: "Team Size",
  funding: "Funding Raised",
  main_expenses: "Main Expenses",
};

const FIELD_PLACEHOLDERS: Record<keyof CompanyFields, string> = {
  company_name: "My Startup Inc.",
  stage: "Pre-seed",
  business_model: "SaaS",
  industry: "Fintech",
  monthly_revenue: "$0",
  team_size: "3",
  funding: "$0",
  main_expenses: "Salaries, Cloud, Marketing",
};

const DEFAULTS: CompanyFields = {
  company_name: { value: "", confidence: "low", source: "default" },
  stage: { value: "Pre-seed", confidence: "low", source: "default" },
  business_model: { value: "SaaS", confidence: "low", source: "default" },
  industry: { value: "", confidence: "low", source: "default" },
  monthly_revenue: { value: "$0", confidence: "low", source: "default" },
  team_size: { value: "1", confidence: "low", source: "default" },
  funding: { value: "$0", confidence: "low", source: "default" },
  main_expenses: { value: "General operations", confidence: "low", source: "default" },
};

const STAGE_OPTIONS = [
  "Pre-seed",
  "Seed",
  "Series A",
  "Series B+",
  "Bootstrapped",
];

const MODEL_OPTIONS = [
  "SaaS",
  "Marketplace",
  "E-commerce",
  "Services",
  "Hardware",
  "Other",
];

// ── Component ───────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>("website");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [greeting, setGreeting] = useState("");
  const [fields, setFields] = useState<CompanyFields>({ ...DEFAULTS });
  const [enrichedCount, setEnrichedCount] = useState(0);
  const [createError, setCreateError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (step === "website") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [step]);

  // ── Website entry ───────────────────────────────────────────────────────

  const handleWebsiteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!websiteUrl.trim()) return;

    setStep("enriching");
    setGreeting("Analyzing...");

    try {
      const res = await fetch("/api/onboarding/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: websiteUrl.trim() }),
      });

      if (!res.ok) {
        // AI not available — go straight to manual form
        setStep("review");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setStep("review");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let fieldCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "greeting") {
              setGreeting(event.greeting || `Onboarding ${event.companyName}`);
            } else if (event.type === "field") {
              const fieldName = event.field as keyof CompanyFields;
              if (fieldName in DEFAULTS) {
                setFields((prev) => ({
                  ...prev,
                  [fieldName]: {
                    value: event.value,
                    confidence: event.confidence,
                    source: "ai" as const,
                  },
                }));
                fieldCount++;
                setEnrichedCount(fieldCount);
              }
            } else if (event.type === "status") {
              setGreeting(event.message);
            } else if (event.type === "done") {
              // Move to review
              setStep("review");
            }
          } catch {
            // Skip malformed events
          }
        }
      }

      // If stream ended without done event
      if (step !== "review") {
        setStep("review");
      }
    } catch {
      // Network error — fall back to manual form
      setStep("review");
    }
  };

  const skipToForm = () => {
    setStep("review");
  };

  const skipOnboarding = () => {
    router.push("/dashboard");
  };

  // ── Field update ────────────────────────────────────────────────────────

  const updateField = (name: keyof CompanyFields, value: string) => {
    setFields((prev) => ({
      ...prev,
      [name]: { ...prev[name], value, source: "user" as const },
    }));
  };

  // ── Create company ──────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!fields.company_name.value.trim()) {
      setCreateError("Company name is required");
      return;
    }

    // Prevent double-submit — ref survives across renders
    if (submittingRef.current) return;
    submittingRef.current = true;

    setStep("creating");
    setCreateError(null);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: fields.company_name.value,
          stage: fields.stage.value,
          business_model: fields.business_model.value,
          monthly_revenue: fields.monthly_revenue.value,
          team_size: fields.team_size.value,
          funding: fields.funding.value,
          main_expenses: fields.main_expenses.value,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create company");
      }

      setStep("done");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setCreateError(message);
      setStep("review");
      submittingRef.current = false;
    }
  };

  // ── Confidence badge ──────────────────────────────────────────────────

  const ConfidenceBadge = ({
    confidence,
    source,
  }: {
    confidence: string;
    source: string;
  }) => {
    if (source === "user") return null;
    if (source === "default") return null;

    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
          confidence === "high"
            ? "bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-500"
            : confidence === "medium"
              ? "bg-warning-50 text-warning-700 dark:bg-warning-950 dark:text-warning-500"
              : "bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400"
        }`}
      >
        <Sparkles className="h-2.5 w-2.5" />
        {confidence === "high" ? "AI confident" : confidence === "medium" ? "AI guess" : "AI low"}
      </span>
    );
  };

  // ── Step 1: Website Entry ─────────────────────────────────────────────

  if (step === "website") {
    return (
      <div className="min-h-screen bg-surface-50 dark:bg-surface-950 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center animate-slide-up">
          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-8 rounded-full bg-brand-600" />
              <div className="h-2 w-8 rounded-full bg-surface-200 dark:bg-surface-700" />
              <div className="h-2 w-8 rounded-full bg-surface-200 dark:bg-surface-700" />
            </div>
            <span className="text-xs font-medium text-surface-500 dark:text-surface-400">
              Step 1 of 3
            </span>
          </div>

          <div className="h-14 w-14 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto mb-6 shadow-lg">
            <span className="text-white font-bold text-2xl">B</span>
          </div>
          <h1 className="text-3xl font-bold text-surface-900 dark:text-surface-50">
            Welcome to Burnless
          </h1>
          <p className="mt-3 text-surface-500 dark:text-surface-400 max-w-sm mx-auto">
            Enter your company website and we'll set everything up for you.
          </p>

          <form onSubmit={handleWebsiteSubmit} className="mt-8">
            <div className="relative">
              <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
              <input
                ref={inputRef}
                type="text"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="yourcompany.com"
                className="w-full rounded-2xl border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-800 pl-12 pr-4 py-4 text-base text-surface-900 dark:text-surface-50 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={!websiteUrl.trim()}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-4 text-base font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-5 h-5" />
              Set Up My Company
            </button>
          </form>

          <button
            onClick={skipToForm}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-800 px-6 py-3.5 text-base font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
          >
            <SkipForward className="w-4 h-4" />
            I'll fill in manually
          </button>
          <p className="mt-2 text-center text-xs text-surface-400">
            You can always update this later in Settings
          </p>
        </div>
      </div>
    );
  }

  // ── Step 2: Enriching (AI analyzing) ──────────────────────────────────

  if (step === "enriching") {
    return (
      <div className="min-h-screen bg-surface-50 dark:bg-surface-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center animate-fade-in">
          <div className="relative mx-auto mb-6">
            <div className="h-14 w-14 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto shadow-lg">
              <Sparkles className="w-7 h-7 text-white animate-pulse" />
            </div>
          </div>
          <h2 className="text-xl font-semibold text-surface-900 dark:text-surface-50">
            {greeting}
          </h2>
          <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
            Analyzing {websiteUrl}
          </p>

          {/* Progress dots */}
          <div className="mt-8 flex justify-center gap-2">
            {Object.keys(DEFAULTS).map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full transition-all duration-500 ${
                  i < enrichedCount
                    ? "bg-brand-600 scale-100"
                    : "bg-surface-200 dark:bg-surface-700 scale-75"
                }`}
              />
            ))}
          </div>

          <p className="mt-4 text-xs text-surface-400">
            {enrichedCount > 0
              ? `Found ${enrichedCount} field${enrichedCount !== 1 ? "s" : ""}`
              : "Searching..."}
          </p>

          <button
            onClick={skipToForm}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-surface-300 dark:border-surface-600 px-5 py-2.5 text-sm font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            <SkipForward className="w-4 h-4" />
            Skip — I'll fill in manually
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: Review Form ───────────────────────────────────────────────

  if (step === "review") {
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
              onClick={skipOnboarding}
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
              onChange={(v) => updateField("company_name", v)}
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
                    onClick={() => updateField("stage", option)}
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
                    onClick={() => updateField("business_model", option)}
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
              onChange={(v) => updateField("industry", v)}
              badge={<ConfidenceBadge {...fields.industry} />}
            />
            <FormField
              label={FIELD_LABELS.monthly_revenue}
              field={fields.monthly_revenue}
              placeholder={FIELD_PLACEHOLDERS.monthly_revenue}
              onChange={(v) => updateField("monthly_revenue", v)}
              badge={<ConfidenceBadge {...fields.monthly_revenue} />}
            />
            <FormField
              label={FIELD_LABELS.team_size}
              field={fields.team_size}
              placeholder={FIELD_PLACEHOLDERS.team_size}
              onChange={(v) => updateField("team_size", v)}
              badge={<ConfidenceBadge {...fields.team_size} />}
            />
            <FormField
              label={FIELD_LABELS.funding}
              field={fields.funding}
              placeholder={FIELD_PLACEHOLDERS.funding}
              onChange={(v) => updateField("funding", v)}
              badge={<ConfidenceBadge {...fields.funding} />}
            />
            <FormField
              label={FIELD_LABELS.main_expenses}
              field={fields.main_expenses}
              placeholder={FIELD_PLACEHOLDERS.main_expenses}
              onChange={(v) => updateField("main_expenses", v)}
              badge={<ConfidenceBadge {...fields.main_expenses} />}
            />
          </div>

          <button
            onClick={handleCreate}
            className="mt-8 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-4 text-base font-medium text-white hover:bg-brand-700 transition-colors"
          >
            Create My Company
            <ArrowRight className="w-5 h-5" />
          </button>

          <button
            onClick={skipOnboarding}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-surface-200 dark:border-surface-700 px-6 py-3 text-sm font-medium text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
          >
            I'll do this later
          </button>

          <p className="mt-3 text-center text-xs text-surface-400">
            You can always fill this in from Settings.
          </p>
        </div>
      </div>
    );
  }

  // ── Step 4: Creating ──────────────────────────────────────────────────

  if (step === "creating") {
    return (
      <div className="min-h-screen bg-surface-50 dark:bg-surface-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center animate-fade-in">
          <Loader2 className="w-10 h-10 text-brand-600 animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50">
            Building your financial model
          </h2>
          <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
            Setting up {fields.company_name.value || "your company"}...
          </p>
          <div className="mt-6 space-y-2.5 text-left max-w-xs mx-auto">
            {[
              "Creating company profile",
              "Setting up base scenario",
              "Building expense model",
              "Generating projections",
            ].map((task, i) => (
              <div
                key={task}
                className="flex items-center gap-2.5 text-sm text-surface-500 dark:text-surface-400 animate-slide-up"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <Check className="w-4 h-4 text-success-500 flex-shrink-0" />
                {task}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 5: Done ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center animate-scale-in">
        <div className="w-14 h-14 rounded-2xl bg-success-100 dark:bg-success-950 flex items-center justify-center mx-auto mb-4 animate-celebrate">
          <Check className="w-7 h-7 text-success-600 dark:text-success-500" />
        </div>
        <h2 className="text-xl font-bold text-surface-900 dark:text-surface-50">
          You're all set!
        </h2>
        <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
          {fields.company_name.value || "Your company"}'s financial model is
          ready.
        </p>
        <button
          onClick={() => router.push("/dashboard")}
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-6 py-4 text-base font-medium text-white hover:bg-brand-700 transition-colors"
        >
          Go to Dashboard
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ── Form Field Component ────────────────────────────────────────────────────

function FormField({
  label,
  field,
  placeholder,
  onChange,
  required,
  badge,
}: {
  label: string;
  field: FieldData;
  placeholder: string;
  onChange: (value: string) => void;
  required?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
          {label}
          {required && <span className="text-danger-500 ml-0.5">*</span>}
        </label>
        {badge}
      </div>
      <input
        type="text"
        value={field.value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border bg-surface-0 dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-50 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${
          field.source === "ai"
            ? "border-brand-300 dark:border-brand-700"
            : "border-surface-300 dark:border-surface-600"
        }`}
      />
    </div>
  );
}
