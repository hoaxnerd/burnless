"use client";

import { useState } from "react";
import Link from "next/link";

type Step = "company" | "model" | "setup";

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>("company");
  const [companyName, setCompanyName] = useState("");
  const [stage, setStage] = useState("pre_seed");
  const [businessModel, setBusinessModel] = useState("saas");

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="h-10 w-10 rounded-lg bg-brand-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-lg">B</span>
          </div>
          <h1 className="text-2xl font-bold text-surface-900">
            Welcome to Burnless
          </h1>
          <p className="mt-2 text-sm text-surface-500">
            Let&apos;s set up your company in under 5 minutes
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(["company", "model", "setup"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`h-2 w-8 rounded-full transition-colors ${
                  (["company", "model", "setup"] as Step[]).indexOf(step) >= i
                    ? "bg-brand-600"
                    : "bg-surface-200"
                }`}
              />
            </div>
          ))}
        </div>

        <div className="bg-surface-0 rounded-xl shadow-sm border border-surface-200 p-6">
          {step === "company" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-surface-900">
                About your company
              </h2>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">
                  Company name
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Inc."
                  className="w-full rounded-lg border border-surface-300 bg-surface-0 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">
                  Stage
                </label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  className="w-full rounded-lg border border-surface-300 bg-surface-0 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  <option value="pre_seed">Pre-seed</option>
                  <option value="seed">Seed</option>
                  <option value="series_a">Series A</option>
                  <option value="series_b">Series B</option>
                  <option value="bootstrapped">Bootstrapped</option>
                </select>
              </div>
              <button
                onClick={() => setStep("model")}
                disabled={!companyName}
                className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                Continue
              </button>
            </div>
          )}

          {step === "model" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-surface-900">
                Business model
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "saas", label: "SaaS" },
                  { value: "marketplace", label: "Marketplace" },
                  { value: "ecommerce", label: "E-commerce" },
                  { value: "services", label: "Services" },
                  { value: "hardware", label: "Hardware" },
                  { value: "other", label: "Other" },
                ].map((model) => (
                  <button
                    key={model.value}
                    onClick={() => setBusinessModel(model.value)}
                    className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                      businessModel === model.value
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-surface-200 text-surface-600 hover:border-surface-300"
                    }`}
                  >
                    {model.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep("company")}
                  className="flex-1 rounded-lg border border-surface-300 px-4 py-2.5 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep("setup")}
                  className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === "setup" && (
            <div className="space-y-4 text-center">
              <div className="text-4xl mb-2">🎉</div>
              <h2 className="text-lg font-semibold text-surface-900">
                You&apos;re all set!
              </h2>
              <p className="text-sm text-surface-500">
                {companyName} is ready to go. You can start by connecting your
                accounts or chatting with the AI to build your first financial
                model.
              </p>
              <Link
                href="/overview"
                className="inline-block w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
              >
                Go to dashboard
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
