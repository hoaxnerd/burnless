"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";

import type { OnboardingStep, CompanyFields } from "./_components/types";
import { DEFAULTS } from "./_components/constants";
import { WebsiteStep } from "./_components/website-step";
import { EnrichingStep } from "./_components/enriching-step";
import { ReviewStep } from "./_components/review-step";
import { CreatingStep } from "./_components/creating-step";
import { DoneStep } from "./_components/done-step";

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
    trackEvent("onboarding_website_submitted", { url: websiteUrl.trim() });

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
    trackEvent("onboarding_skip_enrichment", { from_step: step });
    setStep("review");
  };

  const skipOnboarding = () => {
    trackEvent("onboarding_skip_all", { from_step: step });
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
    trackEvent("onboarding_company_create_started");

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
      trackEvent("onboarding_completed");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      trackEvent("onboarding_company_create_error", { error: message });
      setCreateError(message);
      setStep("review");
      submittingRef.current = false;
    }
  };

  // ── Render steps ──────────────────────────────────────────────────────

  switch (step) {
    case "website":
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

    case "enriching":
      return (
        <EnrichingStep
          greeting={greeting}
          websiteUrl={websiteUrl}
          enrichedCount={enrichedCount}
          onSkipToForm={skipToForm}
          onSkipOnboarding={skipOnboarding}
        />
      );

    case "review":
      return (
        <ReviewStep
          fields={fields}
          createError={createError}
          onUpdateField={updateField}
          onCreate={handleCreate}
          onSkipOnboarding={skipOnboarding}
        />
      );

    case "creating":
      return (
        <CreatingStep companyName={fields.company_name.value} />
      );

    case "done":
      return (
        <DoneStep
          companyName={fields.company_name.value}
          onGoToDashboard={() => router.push("/dashboard")}
        />
      );
  }
}
