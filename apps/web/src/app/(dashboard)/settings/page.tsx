"use client";

import { useState } from "react";
import {
  BookOpen,
  FileSpreadsheet,
  Landmark,
  CreditCard,
  Building2,
  DollarSign,
  Check,
  Clock,
  Upload,
  Sparkles,
  Power,
  Database,
  Shield,
  Lock,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { useAiFlags } from "@/components/ai/ai-feature-context";
import { AI_FEATURE_LIST, type AiDataMode } from "@burnless/ai";

interface IntegrationItem {
  type: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: "available" | "coming_soon" | "connected";
  href?: string;
}

const integrations: IntegrationItem[] = [
  {
    type: "csv_import",
    name: "CSV Import",
    description: "Import transactions from bank statements and spreadsheets",
    icon: <FileSpreadsheet className="h-5 w-5" />,
    status: "available",
    href: "/import",
  },
  {
    type: "quickbooks",
    name: "QuickBooks",
    description: "Sync your QuickBooks accounting data automatically",
    icon: <BookOpen className="h-5 w-5" />,
    status: "coming_soon",
  },
  {
    type: "xero",
    name: "Xero",
    description: "Connect your Xero accounting for real-time sync",
    icon: <BookOpen className="h-5 w-5" />,
    status: "coming_soon",
  },
  {
    type: "freshbooks",
    name: "FreshBooks",
    description: "Import invoices and expenses from FreshBooks",
    icon: <BookOpen className="h-5 w-5" />,
    status: "coming_soon",
  },
  {
    type: "plaid",
    name: "Plaid",
    description: "Connect bank accounts directly for transaction import",
    icon: <Landmark className="h-5 w-5" />,
    status: "coming_soon",
  },
  {
    type: "mercury",
    name: "Mercury",
    description: "Sync your Mercury banking transactions automatically",
    icon: <Building2 className="h-5 w-5" />,
    status: "coming_soon",
  },
  {
    type: "gusto",
    name: "Gusto",
    description: "Import payroll data and employee costs from Gusto",
    icon: <DollarSign className="h-5 w-5" />,
    status: "coming_soon",
  },
  {
    type: "stripe",
    name: "Stripe",
    description: "Sync revenue and payment data from Stripe",
    icon: <CreditCard className="h-5 w-5" />,
    status: "coming_soon",
  },
];

const tabs = [
  { key: "general" as const, label: "General" },
  { key: "ai" as const, label: "AI Features" },
  { key: "integrations" as const, label: "Integrations" },
  { key: "billing" as const, label: "Billing" },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<
    "general" | "ai" | "integrations" | "billing"
  >("general");
  const { flags, updateFlags, loaded: aiLoaded } = useAiFlags();

  return (
    <div>
      <div className="mb-8 sm:mb-12">
        <h1 className="text-xl sm:text-2xl font-bold text-surface-900 tracking-tight">
          Settings
        </h1>
        <p className="mt-1.5 text-sm text-surface-500">
          Manage your company, integrations, and billing
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-200 mb-8">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-surface-500 hover:text-surface-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* General Tab */}
      {activeTab === "general" && (
        <div className="space-y-8 max-w-2xl">
          <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
            <h2 className="text-base font-semibold text-surface-900 mb-6">
              Company
            </h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Company name
                </label>
                <input
                  type="text"
                  placeholder="My Startup Inc."
                  className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">
                    Stage
                  </label>
                  <select className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20d%3D%22m2%204%204%204%204-4%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_12px_center]">
                    <option>Pre-seed</option>
                    <option>Seed</option>
                    <option>Series A</option>
                    <option>Series B</option>
                    <option>Series C+</option>
                    <option>Bootstrapped</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">
                    Currency
                  </label>
                  <select className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20d%3D%22m2%204%204%204%204-4%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_12px_center]">
                    <option>USD ($)</option>
                    <option>EUR (&euro;)</option>
                    <option>GBP (&pound;)</option>
                    <option>INR (&#8377;)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Security & Privacy Trust Signals */}
          <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
            <h2 className="text-base font-semibold text-surface-900 mb-6">
              Security & Privacy
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 rounded-xl bg-surface-50 border border-surface-100">
                <div className="h-9 w-9 rounded-lg bg-success-50 flex items-center justify-center shrink-0">
                  <Shield className="h-4.5 w-4.5 text-success-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-900">Data encrypted at rest & in transit</p>
                  <p className="text-xs text-surface-500 mt-0.5">AES-256 encryption for all financial data. TLS 1.3 for all connections.</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 rounded-xl bg-surface-50 border border-surface-100">
                <div className="h-9 w-9 rounded-lg bg-success-50 flex items-center justify-center shrink-0">
                  <Lock className="h-4.5 w-4.5 text-success-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-900">SOC 2 Type II compliant architecture</p>
                  <p className="text-xs text-surface-500 mt-0.5">Enterprise-grade security controls and access management.</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 rounded-xl bg-surface-50 border border-surface-100">
                <div className="h-9 w-9 rounded-lg bg-success-50 flex items-center justify-center shrink-0">
                  <Eye className="h-4.5 w-4.5 text-success-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-900">Your data is never used for AI training</p>
                  <p className="text-xs text-surface-500 mt-0.5">Full control over AI features. Disable anytime from the AI Features tab.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Features Tab */}
      {activeTab === "ai" && aiLoaded && (
        <div className="space-y-6 max-w-2xl">
          {/* Level 1: Master Switch */}
          <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-brand-100 flex items-center justify-center">
                  <Power className="h-5 w-5 text-brand-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-surface-900">
                    AI Master Switch
                  </h2>
                  <p className="text-sm text-surface-500 mt-0.5">
                    {flags.masterEnabled
                      ? "AI features are active across the platform"
                      : "All AI features are disabled \u2014 pure deterministic mode"}
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  updateFlags({ masterEnabled: !flags.masterEnabled })
                }
                className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                  flags.masterEnabled
                    ? "bg-brand-600"
                    : "bg-surface-300"
                }`}
                role="switch"
                aria-checked={flags.masterEnabled}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    flags.masterEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Level 3: Data Retention Mode */}
          {flags.masterEnabled && (
            <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
              <div className="flex items-center gap-4 mb-5">
                <div className="h-9 w-9 rounded-lg bg-surface-100 flex items-center justify-center">
                  <Database className="h-4.5 w-4.5 text-surface-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-surface-900">
                    AI Data Mode
                  </h2>
                  <p className="text-sm text-surface-500 mt-0.5">
                    Control how AI generates and displays data
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {(
                  [
                    {
                      value: "full" as AiDataMode,
                      label: "Full",
                      desc: "Generate new AI content and show cached results",
                    },
                    {
                      value: "show_cached" as AiDataMode,
                      label: "Cached Only",
                      desc: "Show previously generated AI data, no new LLM calls",
                    },
                    {
                      value: "hide_all" as AiDataMode,
                      label: "Hide All",
                      desc: "Hide all AI-generated content entirely",
                    },
                  ]
                ).map((mode) => (
                  <label
                    key={mode.value}
                    className={`flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-all ${
                      flags.dataMode === mode.value
                        ? "border-brand-500 bg-brand-50 shadow-sm"
                        : "border-surface-200 hover:bg-surface-50 hover:border-surface-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="dataMode"
                      value={mode.value}
                      checked={flags.dataMode === mode.value}
                      onChange={() => updateFlags({ dataMode: mode.value })}
                      className="h-4 w-4 text-brand-600 focus:ring-brand-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-surface-900">
                        {mode.label}
                      </span>
                      <p className="text-xs text-surface-500 mt-0.5">
                        {mode.desc}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Level 2: Per-Feature Switches */}
          {flags.masterEnabled && (
            <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
              <div className="flex items-center gap-4 mb-5">
                <div className="h-9 w-9 rounded-lg bg-surface-100 flex items-center justify-center">
                  <Sparkles className="h-4.5 w-4.5 text-surface-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-surface-900">
                    Feature Toggles
                  </h2>
                  <p className="text-sm text-surface-500 mt-0.5">
                    Enable or disable individual AI capabilities
                  </p>
                </div>
              </div>
              <div className="divide-y divide-surface-100">
                {AI_FEATURE_LIST.map((feat) => {
                  const isOn =
                    flags.features[feat.name as keyof typeof flags.features];
                  return (
                    <div
                      key={feat.name}
                      className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p className="text-sm font-medium text-surface-900">
                          {feat.label}
                        </p>
                        <p className="text-xs text-surface-500 mt-0.5">
                          {feat.description}
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          updateFlags({
                            features: {
                              ...flags.features,
                              [feat.name]: !isOn,
                            },
                          })
                        }
                        className={`relative inline-flex h-6 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                          isOn
                            ? "bg-brand-600"
                            : "bg-surface-300"
                        }`}
                        role="switch"
                        aria-checked={isOn}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            isOn ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Integrations Tab */}
      {activeTab === "integrations" && (
        <div className="max-w-3xl">
          <div className="space-y-3">
            {integrations.map((integration) => (
              <div
                key={integration.type}
                className="rounded-2xl bg-surface-0 border border-surface-200 p-5 flex items-center gap-4 hover:border-surface-300 transition-all"
              >
                <div className="h-11 w-11 rounded-xl bg-surface-100 flex items-center justify-center text-surface-600 shrink-0">
                  {integration.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-surface-900">
                      {integration.name}
                    </h3>
                    {integration.status === "coming_soon" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-medium text-surface-500">
                        <Clock className="h-3 w-3" />
                        Coming Soon
                      </span>
                    )}
                    {integration.status === "connected" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-medium text-success-700">
                        <Check className="h-3 w-3" />
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {integration.description}
                  </p>
                </div>
                <div>
                  {integration.status === "available" && integration.href ? (
                    <Link
                      href={integration.href}
                      className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors shadow-sm shadow-brand-600/20"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Import
                    </Link>
                  ) : integration.status === "connected" ? (
                    <button className="rounded-xl border border-surface-300 px-4 py-2 text-xs font-medium text-surface-600 hover:bg-surface-50 transition-colors">
                      Manage
                    </button>
                  ) : (
                    <button
                      disabled
                      className="rounded-xl border border-surface-200 px-4 py-2 text-xs font-medium text-surface-400 cursor-not-allowed"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Billing Tab */}
      {activeTab === "billing" && (
        <div className="max-w-3xl space-y-8">
          {/* Current plan */}
          <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-surface-900">
                Current Plan
              </h2>
              <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                Free
              </span>
            </div>
            <p className="text-sm text-surface-500">
              You&apos;re on the free plan. Upgrade to unlock unlimited scenarios, AI
              companion, and export features.
            </p>
          </div>

          {/* Pricing tiers */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            {[
              {
                name: "Free",
                price: "$0",
                period: "forever",
                current: true,
                features: [
                  "1 scenario",
                  "Basic metrics",
                  "Manual data entry",
                  "CSV import",
                ],
              },
              {
                name: "Pro",
                price: "$49",
                period: "/month",
                current: false,
                popular: true,
                features: [
                  "Unlimited scenarios",
                  "AI companion",
                  "PDF & CSV export",
                  "Data room",
                  "Priority support",
                ],
              },
              {
                name: "Team",
                price: "$99",
                period: "/month + $20/seat",
                current: false,
                features: [
                  "Everything in Pro",
                  "Team collaboration",
                  "Role-based access",
                  "Audit log",
                  "Custom integrations",
                ],
              },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`rounded-2xl border p-6 sm:p-7 transition-all ${
                  tier.popular
                    ? "border-brand-500 bg-brand-50/50 shadow-md shadow-brand-500/10 relative"
                    : "border-surface-200 bg-surface-0 hover:border-surface-300"
                }`}
              >
                {tier.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-brand-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                    Most Popular
                  </span>
                )}
                <h3 className="text-lg font-bold text-surface-900">
                  {tier.name}
                </h3>
                <div className="mt-3 mb-5">
                  <span className="text-3xl font-bold text-surface-900 tabular-nums">
                    {tier.price}
                  </span>
                  <span className="text-sm text-surface-500 ml-1">
                    {tier.period}
                  </span>
                </div>
                <ul className="space-y-2.5 mb-7">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2.5 text-sm text-surface-600"
                    >
                      <Check className="h-4 w-4 text-success-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  disabled={tier.current}
                  className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                    tier.current
                      ? "bg-surface-100 text-surface-400 cursor-not-allowed"
                      : tier.popular
                        ? "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20 hover:shadow-md hover:shadow-brand-600/25"
                        : "border border-surface-300 text-surface-700 hover:bg-surface-50 hover:border-surface-400"
                  }`}
                >
                  {tier.current ? "Current Plan" : "Upgrade"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
