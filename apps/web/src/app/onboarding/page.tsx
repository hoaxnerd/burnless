"use client";

import { useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";

import type {
  OnboardingStep,
  CompanyFields,
  FundingRound,
  HeadcountRole,
  OperatingExpense,
  RevenueStream,
} from "./_components/types";
import { DEFAULTS } from "./_components/constants";
import { WebsiteStep } from "./_components/website-step";
import { EnrichingStep } from "./_components/enriching-step";
import { DoneStep } from "./_components/done-step";
import { WizardShell } from "./_components/wizard/wizard-shell";
import { AiErrorStep } from "./_components/wizard/ai-error-step";
import { CompanyStep } from "./_components/wizard/steps/company-step";
import { RevenueStep } from "./_components/wizard/steps/revenue-step";
import { FundingStep } from "./_components/wizard/steps/funding-step";
import { ExpensesStep } from "./_components/wizard/steps/expenses-step";
import { TeamStep } from "./_components/wizard/steps/team-step";
import {
  toRevenueSuggestions,
  toFundingSuggestions,
  toExpenseSuggestions,
  toHeadcountSuggestions,
} from "./_components/wizard/suggestion-mappers";

// The wizard's ordered step ids (the steps the WizardShell renders).
const WIZARD_STEPS = ["company", "revenue", "funding", "expenses", "team"] as const;
type WizardStepId = (typeof WIZARD_STEPS)[number];

const WIZARD_STEP_META: { id: WizardStepId; label: string }[] = [
  { id: "company", label: "Company" },
  { id: "revenue", label: "Revenue" },
  { id: "funding", label: "Funding" },
  { id: "expenses", label: "Expenses" },
  { id: "team", label: "Team" },
];

function isWizardStep(step: OnboardingStep): step is WizardStepId {
  return (WIZARD_STEPS as readonly string[]).includes(step);
}

// ── Component ───────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>("website");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [greeting, setGreeting] = useState("");
  // AI-derived company basics (company_name/stage/business_model/industry only).
  const [fields, setFields] = useState<CompanyFields>({ ...DEFAULTS });
  const [founders, setFounders] = useState<string[]>([]);
  // AI suggestion arrays — fed to the wizard step panels via the mappers.
  const [fundingRounds, setFundingRounds] = useState<FundingRound[]>([]);
  const [headcount, setHeadcount] = useState<HeadcountRole[]>([]);
  const [expenses, setExpenses] = useState<OperatingExpense[]>([]);
  const [revenueStreams, setRevenueStreams] = useState<RevenueStream[]>([]);
  const [enrichedCount, setEnrichedCount] = useState(0);
  const [agentError, setAgentError] = useState<string | null>(null);
  // Whether to feed the AI suggestions into the wizard. The "enter details
  // manually" escape from the AI-error step enters the wizard with empty
  // suggestions instead.
  const [useSuggestions, setUseSuggestions] = useState(true);
  // companyId is set once CompanyStep creates the company; departments are then
  // fetched for the Team step.
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const movedOnRef = useRef(false);

  useEffect(() => {
    if (step === "website") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [step]);

  // ── Website entry / enrichment ────────────────────────────────────────────

  const runEnrich = async () => {
    setStep("enriching");
    setGreeting("Analyzing...");
    setAgentError(null);
    movedOnRef.current = false;

    try {
      const res = await apiFetch("/api/onboarding/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: websiteUrl.trim() }),
      });

      if (!res.ok) {
        // AI not available — drop into the wizard manually (no error card).
        enterWizard(true);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        enterWizard(true);
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
              // Only the company-basics fields survive; the old scalar
              // estimates (monthly_revenue/team_size/funding/main_expenses) are
              // ignored — the wizard's per-domain steps replace them.
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
            } else if (event.type === "founders") {
              setFounders(event.value || []);
            } else if (event.type === "funding_rounds") {
              setFundingRounds(event.value || []);
            } else if (event.type === "headcount") {
              setHeadcount(event.value || []);
            } else if (event.type === "expenses") {
              setExpenses(event.value || []);
            } else if (event.type === "revenue_streams") {
              setRevenueStreams(event.value || []);
            } else if (event.type === "status") {
              setGreeting(event.message as string);
            } else if (event.type === "done") {
              movedOnRef.current = true;
              enterWizard(true);
            } else if (event.type === "agent_failed") {
              // Explicit failure screen — no silent timeout fallback.
              movedOnRef.current = true;
              setStep("ai-error");
            }
          } catch (parseErr) {
            // Per-line parse failures in a streaming loop are expected.
            void parseErr;
          }
        }
      }

      // Stream ended without an explicit done/agent_failed — enter the wizard.
      if (!movedOnRef.current) {
        enterWizard(true);
      }
    } catch {
      // Network error — fall back to the wizard manually.
      enterWizard(true);
    }
  };

  const handleWebsiteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!websiteUrl.trim()) return;
    trackEvent("onboarding_website_submitted", { url: websiteUrl.trim() });
    await runEnrich();
  };

  // ── Wizard entry / navigation ─────────────────────────────────────────────

  const enterWizard = (withSuggestions: boolean) => {
    movedOnRef.current = true;
    setUseSuggestions(withSuggestions);
    setStep("company");
  };

  // Manual entry from the website screen (skips enrichment entirely).
  const skipToForm = () => {
    trackEvent("onboarding_skip_enrichment", { from_step: step });
    enterWizard(false);
  };

  // "Skip all / I'll do this later" — if the company exists go to the
  // dashboard, otherwise create a slim company first.
  const skipOnboarding = async () => {
    if (companyId) {
      router.push("/dashboard");
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    trackEvent("onboarding_skip_all", { from_step: step });

    try {
      const res = await apiFetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: fields.company_name.value.trim() || "My Company",
          stage: fields.stage.value || "Pre-seed",
          business_model: fields.business_model.value || "SaaS",
        }),
      });

      if (res.status === 409) {
        const data = (await res.json().catch(() => ({}))) as {
          code?: string;
          redirectTo?: string;
        };
        if (data.code === "ONBOARDING_ALREADY_COMPLETE") {
          window.location.href = data.redirectTo ?? "/dashboard";
          return;
        }
      }

      window.location.href = "/dashboard";
    } catch {
      submittingRef.current = false;
      // Best-effort — still send the user onward.
      window.location.href = "/dashboard";
    }
  };

  // After CompanyStep creates the company, fetch departments for the Team step,
  // then advance to Revenue.
  const handleCompanyCreated = async (newCompanyId: string) => {
    setCompanyId(newCompanyId);
    try {
      const res = await apiFetch("/api/departments");
      if (res.ok) {
        const rows = (await res.json()) as { id: string; name: string }[];
        setDepartments(rows.map((r) => ({ id: r.id, name: r.name })));
      }
    } catch {
      // Non-fatal — the Team step degrades to an empty department list.
    }
    trackEvent("onboarding_company_created");
    setStep("revenue");
  };

  // `step` is the single source of truth for wizard position; next/prev derive
  // from its index in WIZARD_STEPS.
  const advance = () => {
    if (!isWizardStep(step)) return;
    const i = WIZARD_STEPS.indexOf(step);
    const nextId = WIZARD_STEPS[i + 1];
    if (nextId) {
      setStep(nextId);
    } else {
      // Last step ("team") → finish.
      router.push("/dashboard");
    }
  };

  const goBack = () => {
    if (!isWizardStep(step)) return;
    const i = WIZARD_STEPS.indexOf(step);
    const prevId = WIZARD_STEPS[i - 1];
    if (prevId) setStep(prevId);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (step === "website") {
    return (
      <WebsiteStep
        websiteUrl={websiteUrl}
        onWebsiteUrlChange={setWebsiteUrl}
        onSubmit={handleWebsiteSubmit}
        onSkipToForm={skipToForm}
        onSkipOnboarding={skipOnboarding}
        inputRef={inputRef}
      />
    );
  }

  if (step === "enriching") {
    return (
      <EnrichingStep
        greeting={greeting}
        websiteUrl={websiteUrl}
        enrichedCount={enrichedCount}
        onSkipToForm={skipToForm}
        onSkipOnboarding={skipOnboarding}
        agentError={agentError}
      />
    );
  }

  if (step === "ai-error") {
    return (
      <div className="min-h-screen bg-surface-50 dark:bg-surface-950 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <AiErrorStep
            onRetry={() => void runEnrich()}
            onManual={() => enterWizard(false)}
            onLater={() => void skipOnboarding()}
          />
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <DoneStep
        companyName={fields.company_name.value}
        onGoToDashboard={() => router.push("/dashboard")}
      />
    );
  }

  if (isWizardStep(step)) {
    // Suggestions only feed the wizard when we came through a successful AI run.
    const panel = (() => {
      switch (step) {
        case "company":
          return (
            <CompanyStep
              initial={{
                company_name: fields.company_name.value,
                stage: fields.stage.value || undefined,
                business_model: fields.business_model.value || undefined,
                industry: fields.industry.value || undefined,
                founders: useSuggestions ? founders : [],
              }}
              onCreated={(id) => void handleCompanyCreated(id)}
            />
          );
        case "revenue":
          return (
            <RevenueStep
              suggestions={
                useSuggestions ? toRevenueSuggestions(revenueStreams) : []
              }
            />
          );
        case "funding":
          return (
            <FundingStep
              suggestions={
                useSuggestions ? toFundingSuggestions(fundingRounds) : []
              }
            />
          );
        case "expenses":
          // ExpensesStep fetches its own accounts; the mapper falls back to the
          // first account when none are provided here.
          return (
            <ExpensesStep
              suggestions={
                useSuggestions ? toExpenseSuggestions(expenses, []) : []
              }
            />
          );
        case "team":
          return (
            <TeamStep
              departments={departments}
              suggestions={
                useSuggestions
                  ? toHeadcountSuggestions(headcount, departments)
                  : []
              }
            />
          );
      }
    })();

    // CompanyStep owns its own Continue (it must create the company first), so
    // the shell's Continue is disabled there; once the company exists the shell
    // drives navigation.
    const onCompanyStep = step === "company";

    return (
      <WizardShell
        steps={WIZARD_STEP_META}
        activeId={step}
        canContinue={!onCompanyStep}
        isLast={step === "team"}
        onBack={goBack}
        onSkip={advance}
        onContinue={advance}
        hideBack={onCompanyStep}
      >
        {panel}
      </WizardShell>
    );
  }

  // step === "creating" (unused fallthrough) — render nothing.
  return null;
}
