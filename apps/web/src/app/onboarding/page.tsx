"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { useCapabilities } from "@/components/providers/capability-context";

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
import { aiConfigDescriptor } from "./_components/wizard/ai-config-descriptor";
import type { WizardStepHandle } from "./_components/wizard/types";
import {
  toRevenueSuggestions,
  toFundingSuggestions,
  toExpenseSuggestions,
  toHeadcountSuggestions,
} from "./_components/wizard/suggestion-mappers";

// The wizard's possible step ids. The actual ordered list is built per-edition
// in the component (the "ai-config" step is self-host only) — see WIZARD_STEP_META.
type WizardStepId =
  | "company"
  | "ai-config"
  | "revenue"
  | "funding"
  | "expenses"
  | "team";

// ── Component ───────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const caps = useCapabilities();
  // The ai-config step is the single `kind: "configuration"` item, sourced from
  // ONE declarative descriptor (ai-config-descriptor.tsx). The wizard READS the
  // descriptor — its gate, stepper label and render all derive from it, so the
  // config-item seam is load-bearing (a future unified config engine lifts this
  // instance). Gate: the step is shown only when its `hiddenWhenCapability` is
  // OFF. For AI config that cap is "managedAiProvider" — OFF on self-host (BYO
  // key), ON on cloud (providers managed → step hidden, mirroring Settings → AI
  // manager, gated the same way: ai-features-tab.tsx `!caps.managedAiProvider`).
  const showAiConfig = !caps[aiConfigDescriptor.hiddenWhenCapability!];

  // Whether the AI enrich is DEFERRED to run after the ai-config step (two-phase
  // order). Self-host shows ai-config → enrich runs after provider config; cloud
  // has no ai-config step → enrich runs upfront at the website step (legacy). The
  // gate is the same boolean that gates the step's existence.
  const deferEnrich = showAiConfig;

  // The wizard's ordered step list (ids + stepper labels), derived per-edition.
  //
  // TWO-PHASE order (founder directive — the canonical TARGET WIZARD ORDER): on
  // self-host the CONFIGURATION phase (this ai-config step) runs FIRST, BEFORE
  // the DATA phase. The install-company feature is what makes this valid: a real
  // per-company `companies` row exists from first boot, so the ai-config step
  // (which saves a per-company provider DB row via requireCompanyAccess()) does
  // NOT need the wizard's Company step to run first. So on self-host the order is
  //   ai-config → [enrich] → company (claim) → revenue → funding → expenses → team
  // i.e. config phase → AI research/enrich → company-claim → the data steps.
  // The AI enrich is DEFERRED to run AFTER the provider is configured (when
  // leaving the ai-config step) and lands on the Company step — see `deferEnrich`
  // and the `handleContinue` ai-config branch below. The suggestions CAN thus be
  // AI-enriched same-session with the just-configured provider. On cloud (managed
  // AI, no ai-config step) enrich still runs UPFRONT at the website step and the
  // order is company-first. advance()/goBack() index off this list, so both
  // editions stay correct without special-casing. The ai-config label is read
  // from the descriptor title (not an inline literal). See
  // ai-config-descriptor.tsx for the matching note.
  const WIZARD_STEP_META = useMemo<{ id: WizardStepId; label: string }[]>(
    () => [
      ...(showAiConfig
        ? ([{ id: aiConfigDescriptor.id, label: aiConfigDescriptor.title }] as {
            id: WizardStepId;
            label: string;
          }[])
        : []),
      { id: "company", label: "Company" },
      { id: "revenue", label: "Revenue" },
      { id: "funding", label: "Funding" },
      { id: "expenses", label: "Expenses" },
      { id: "team", label: "Team" },
    ],
    [showAiConfig],
  );
  const WIZARD_STEPS = useMemo(
    () => WIZARD_STEP_META.map((s) => s.id),
    [WIZARD_STEP_META],
  );
  const lastStepId = WIZARD_STEPS[WIZARD_STEPS.length - 1];
  const isWizardStep = (s: OnboardingStep): s is WizardStepId =>
    (WIZARD_STEPS as string[]).includes(s);

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
  // Guards the DEFERRED self-host enrich so Back→Continue on the ai-config step
  // does not re-fire it. Set once the post-ai-config enrich has been triggered.
  const enrichedRef = useRef(false);
  // Ref to the active wizard step panel; the global Continue calls its submit().
  const stepRef = useRef<WizardStepHandle>(null);

  useEffect(() => {
    if (step === "website") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [step]);

  // ── Website entry / enrichment ────────────────────────────────────────────

  // `destination` is the wizard step to land on once enrichment finishes (or
  // falls back). Both editions land on "company": on cloud the upfront enrich
  // precedes the (first) Company step; on self-host the DEFERRED enrich fires
  // when leaving the ai-config step and lands on the Company step that follows
  // it (config → enrich → company). `enrichDestRef` remembers the in-flight
  // destination so the ai-error recovery paths (retry/manual) return the user to
  // the SAME step the enrich was headed for, instead of a stale "company"
  // default that would bounce a self-host user to the wrong place.
  const enrichDestRef = useRef<WizardStepId>("company");
  const runEnrich = async (destination: WizardStepId = "company") => {
    enrichDestRef.current = destination;
    setStep("enriching");
    setGreeting("Analyzing...");
    setAgentError(null);
    movedOnRef.current = false;

    try {
      // #1: accept a bare domain (example.com) — prefix https:// if no scheme.
      const raw = websiteUrl.trim();
      const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const res = await apiFetch("/api/onboarding/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: url }),
      });

      if (!res.ok) {
        // AI not available — drop into the wizard manually (no error card).
        enterWizard(true, destination);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        enterWizard(true, destination);
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
              const statusText = event.message as string;
              setGreeting(statusText);
            } else if (event.type === "done") {
              movedOnRef.current = true;
              enterWizard(true, destination);
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
        enterWizard(true, destination);
      }
    } catch {
      // Network error — fall back to the wizard manually.
      enterWizard(true, destination);
    }
  };

  const handleWebsiteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!websiteUrl.trim()) return;
    trackEvent("onboarding_website_submitted", { url: websiteUrl.trim() });
    // Two-phase order: on self-host the enrich is DEFERRED until after the
    // ai-config step (so it uses the just-configured provider) — submitting the
    // website here goes straight to the ai-config step (the FIRST wizard step on
    // self-host). On cloud (no ai-config step, managed AI) the enrich runs
    // UPFRONT and lands on the Company step (the first step there) as before.
    if (deferEnrich) {
      enterWizard(true, "ai-config");
      return;
    }
    await runEnrich("company");
  };

  // ── Wizard entry / navigation ─────────────────────────────────────────────

  const enterWizard = (
    withSuggestions: boolean,
    destination: WizardStepId = "company",
  ) => {
    movedOnRef.current = true;
    setUseSuggestions(withSuggestions);
    setStep(destination);
  };

  // Manual entry from the website screen (skips enrichment entirely). Lands on
  // the FIRST wizard step so the config phase is still presented (ai-config on
  // self-host, company on cloud) — `WIZARD_STEPS[0]` keeps this edition-correct.
  const skipToForm = () => {
    trackEvent("onboarding_skip_enrichment", { from_step: step });
    enterWizard(false, WIZARD_STEPS[0]);
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

  // After CompanyStep creates the company, store the id and fetch departments
  // for the Team step. Navigation is owned by `handleContinue` (the global
  // Continue advances once submit() resolves true) — do NOT setStep here, or the
  // company→revenue transition would fire twice.
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

  // The global Continue: persist the active step's pending work via its
  // imperative submit(), then advance only if it allows. Skip (onSkip) advances
  // WITHOUT calling submit() — it discards that step's pending work.
  //
  // Two-phase seam: when leaving the ai-config step on self-host, the DEFERRED
  // enrich fires ONCE (using the just-configured provider) before advancing to
  // the Company step (config → enrich → company). `runEnrich("company")` shows
  // the transient enriching screen and lands on Company itself, so we do NOT
  // also call advance() here. Guarded by `enrichedRef` so Back→Continue does not
  // re-fire the (paid) enrich; a second Continue just advances normally.
  const handleContinue = async () => {
    const ok = await stepRef.current?.submit();
    if (!ok) return;
    if (
      deferEnrich &&
      step === "ai-config" &&
      !enrichedRef.current &&
      // Only enrich when the user gave a website AND opted into suggestions
      // (manual-entry escapes set useSuggestions=false). Otherwise just advance.
      useSuggestions &&
      websiteUrl.trim()
    ) {
      enrichedRef.current = true;
      await runEnrich("company");
      return;
    }
    advance();
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
            // Recover to the step the failed enrich was headed for — NOT the
            // "company" default. On self-host the deferred enrich targets the
            // Company step (config → enrich → company); a stale "company" default
            // happens to match today, but keying off the remembered destination
            // keeps retry/manual correct if the post-config landing step ever
            // changes, and avoids bouncing the user past already-completed steps.
            onRetry={() => void runEnrich(enrichDestRef.current)}
            onManual={() => enterWizard(false, enrichDestRef.current)}
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
              ref={stepRef}
              initial={{
                company_name: fields.company_name.value,
                stage: fields.stage.value || undefined,
                business_model: fields.business_model.value || undefined,
                industry: fields.industry.value || undefined,
                founders: useSuggestions ? founders : [],
                // #2: seed "Your name" from the AI-suggested first founder.
                user_name: useSuggestions ? (founders[0] ?? "") : "",
              }}
              onCreated={(id) => void handleCompanyCreated(id)}
            />
          );
        case "ai-config":
          // Dispatch render through the descriptor (single source — the gate,
          // stepper label and panel all read from aiConfigDescriptor). The step
          // is included only when showAiConfig is true (self-host), so this case
          // is unreachable on cloud. Optional config step — reuses the P3
          // AiProvidersManager verbatim; its submit() is a pass-through.
          return aiConfigDescriptor.render(stepRef);
        case "revenue":
          return (
            <RevenueStep
              ref={stepRef}
              suggestions={
                useSuggestions ? toRevenueSuggestions(revenueStreams) : []
              }
            />
          );
        case "funding":
          return (
            <FundingStep
              ref={stepRef}
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
              ref={stepRef}
              suggestions={
                useSuggestions ? toExpenseSuggestions(expenses, []) : []
              }
            />
          );
        case "team":
          return (
            <TeamStep
              ref={stepRef}
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

    // The single global Continue drives every step via its submit() (see
    // handleContinue). The company step can't be SKIPPED (it claims/finalizes
    // the company — on self-host it claims the install-time placeholder company,
    // on cloud it creates one; either way the company must be finalized before
    // the rest of the wizard), so hide Skip there. Back is hidden only on the
    // FIRST wizard step (there is nowhere to go back to): on cloud that is the
    // Company step; on self-host the ai-config step precedes Company, so Back IS
    // available on Company (lets the user return to fix their AI provider) and
    // hidden on ai-config instead. Continue is always enabled; the step's
    // submit() gates advancement.
    const onCompanyStep = step === "company";
    const onFirstStep = step === WIZARD_STEPS[0];

    return (
      <WizardShell
        steps={WIZARD_STEP_META}
        activeId={step}
        canContinue={true}
        isLast={step === lastStepId}
        onBack={goBack}
        onSkip={advance}
        onContinue={handleContinue}
        hideBack={onFirstStep}
        hideSkip={onCompanyStep}
      >
        {panel}
      </WizardShell>
    );
  }

  // step === "creating" (unused fallthrough) — render nothing.
  return null;
}
