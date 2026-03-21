"use client";

import { useState, useEffect, useCallback } from "react";
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
  Save,
  Loader2,
  AlertCircle,
  Unplug,
  Bell,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useAiFlags } from "@/components/ai/ai-feature-context";
import { AI_FEATURE_LIST, type AiDataMode } from "@burnless/ai";
import { CURRENCIES, DATA_REGIONS, type CurrencyCode, type DataRegion } from "@burnless/types";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

interface IntegrationDef {
  type: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  href?: string;
  implemented: boolean;
}

const AVAILABLE_INTEGRATIONS: IntegrationDef[] = [
  {
    type: "csv_import",
    name: "CSV Import",
    description: "Import transactions from bank statements and spreadsheets",
    icon: <FileSpreadsheet className="h-5 w-5" />,
    href: "/import",
    implemented: true,
  },
  {
    type: "stripe",
    name: "Stripe",
    description: "Sync revenue and payment data from Stripe",
    icon: <CreditCard className="h-5 w-5" />,
    implemented: true,
  },
];

const COMING_SOON_INTEGRATIONS: IntegrationDef[] = [
  {
    type: "plaid",
    name: "Plaid",
    description: "Connect bank accounts directly for transaction import",
    icon: <Landmark className="h-5 w-5" />,
    implemented: false,
  },
  {
    type: "quickbooks",
    name: "QuickBooks",
    description: "Sync your QuickBooks accounting data automatically",
    icon: <BookOpen className="h-5 w-5" />,
    implemented: false,
  },
  {
    type: "xero",
    name: "Xero",
    description: "Connect your Xero accounting for real-time sync",
    icon: <BookOpen className="h-5 w-5" />,
    implemented: false,
  },
  {
    type: "freshbooks",
    name: "FreshBooks",
    description: "Import invoices and expenses from FreshBooks",
    icon: <BookOpen className="h-5 w-5" />,
    implemented: false,
  },
  {
    type: "mercury",
    name: "Mercury",
    description: "Sync your Mercury banking transactions automatically",
    icon: <Building2 className="h-5 w-5" />,
    implemented: false,
  },
  {
    type: "gusto",
    name: "Gusto",
    description: "Import payroll data and employee costs from Gusto",
    icon: <DollarSign className="h-5 w-5" />,
    implemented: false,
  },
];

interface ConnectedIntegration {
  id: string;
  type: string;
  status: string;
  lastSyncAt: string | null;
}

interface CompanyProfile {
  name: string;
  stage: string;
  currency: string;
  locale: string;
  timezone: string;
  region: string;
  industry: string | null;
  businessModel: string;
}

const STAGE_OPTIONS = [
  { value: "pre_seed", label: "Pre-seed" },
  { value: "seed", label: "Seed" },
  { value: "series_a", label: "Series A" },
  { value: "series_b", label: "Series B" },
  { value: "series_c_plus", label: "Series C+" },
  { value: "bootstrapped", label: "Bootstrapped" },
];

const CURRENCY_OPTIONS = Object.values(CURRENCIES).map((c) => ({
  value: c.code,
  label: `${c.code} (${c.symbol})`,
}));

const LOCALE_OPTIONS = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-IN", label: "English (India)" },
  { value: "en-CA", label: "English (Canada)" },
  { value: "en-AU", label: "English (Australia)" },
  { value: "en-SG", label: "English (Singapore)" },
  { value: "de-DE", label: "German (Germany)" },
  { value: "ja-JP", label: "Japanese (Japan)" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "ar-AE", label: "Arabic (UAE)" },
];

const REGION_OPTIONS = (Object.entries(DATA_REGIONS) as [DataRegion, { name: string; location: string }][]).map(
  ([key, val]) => ({
    value: key,
    label: `${val.name} (${val.location})`,
  })
);

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

  // Company profile state
  const [company, setCompany] = useState<CompanyProfile>({
    name: "",
    stage: "pre_seed",
    currency: "USD",
    locale: "en-US",
    timezone: "America/New_York",
    region: "us-east",
    industry: null,
    businessModel: "saas",
  });
  const [companyLoaded, setCompanyLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Integrations state
  const [connectedIntegrations, setConnectedIntegrations] = useState<ConnectedIntegration[]>([]);
  const [integrationsLoaded, setIntegrationsLoaded] = useState(false);
  const [notifiedIntegrations, setNotifiedIntegrations] = useState<Set<string>>(new Set());

  // Load company profile
  useEffect(() => {
    fetch("/api/company")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setCompany({
            name: data.name || "",
            stage: data.stage || "pre_seed",
            currency: data.currency || "USD",
            locale: data.locale || "en-US",
            timezone: data.timezone || "America/New_York",
            region: data.region || "us-east",
            industry: data.industry,
            businessModel: data.businessModel || "saas",
          });
        }
        setCompanyLoaded(true);
      })
      .catch(() => setCompanyLoaded(true));
  }, []);

  // Load integrations
  const loadIntegrations = useCallback(() => {
    fetch("/api/integrations")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setConnectedIntegrations(data);
        setIntegrationsLoaded(true);
      })
      .catch(() => setIntegrationsLoaded(true));
  }, []);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  // Save company profile
  const saveCompany = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(company),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } else {
        const data = await res.json();
        setSaveError(data.error || "Failed to save");
      }
    } catch {
      setSaveError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Disconnect integration
  const disconnectIntegration = async (id: string) => {
    const res = await fetch(`/api/integrations/${id}`, { method: "DELETE" });
    if (res.ok) loadIntegrations();
  };

  const getIntegrationStatus = (type: string, implemented: boolean): "available" | "coming_soon" | "connected" => {
    const connected = connectedIntegrations.find((i) => i.type === type);
    if (connected && connected.status === "active") return "connected";
    if (implemented) return "available";
    return "coming_soon";
  };

  const getConnectedId = (type: string): string | null => {
    return connectedIntegrations.find((i) => i.type === type)?.id ?? null;
  };

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
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-surface-900">Company</h2>
              <Button
                variant={saveSuccess ? "success" : "primary"}
                size="sm"
                icon={saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saveSuccess ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                disabled={saving || !companyLoaded}
                onClick={saveCompany}
              >
                {saveSuccess ? "Saved" : "Save Changes"}
              </Button>
            </div>
            {saveError && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-700">
                <AlertCircle className="h-3.5 w-3.5" />
                {saveError}
              </div>
            )}
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Company name
                </label>
                <input
                  type="text"
                  value={company.name}
                  onChange={(e) => setCompany((c) => ({ ...c, name: e.target.value }))}
                  placeholder="My Startup Inc."
                  className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">
                    Stage
                  </label>
                  <select
                    value={company.stage}
                    onChange={(e) => setCompany((c) => ({ ...c, stage: e.target.value }))}
                    className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20d%3D%22m2%204%204%204%204-4%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_12px_center]"
                  >
                    {STAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">
                    Currency
                  </label>
                  <select
                    value={company.currency}
                    onChange={(e) => setCompany((c) => ({ ...c, currency: e.target.value }))}
                    className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20d%3D%22m2%204%204%204%204-4%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_12px_center]"
                  >
                    {CURRENCY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">
                    Locale
                  </label>
                  <select
                    value={company.locale}
                    onChange={(e) => setCompany((c) => ({ ...c, locale: e.target.value }))}
                    className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20d%3D%22m2%204%204%204%204-4%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_12px_center]"
                  >
                    {LOCALE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">
                    Timezone
                  </label>
                  <input
                    type="text"
                    value={company.timezone}
                    onChange={(e) => setCompany((c) => ({ ...c, timezone: e.target.value }))}
                    placeholder="America/New_York"
                    className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Data Region
                </label>
                <select
                  value={company.region}
                  onChange={(e) => setCompany((c) => ({ ...c, region: e.target.value }))}
                  className="w-full rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20d%3D%22m2%204%204%204%204-4%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_12px_center]"
                >
                  {REGION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
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
                  <Shield className="h-[18px] w-[18px] text-success-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-900">Data encrypted at rest & in transit</p>
                  <p className="text-xs text-surface-500 mt-0.5">AES-256 encryption for all financial data. TLS 1.3 for all connections.</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 rounded-xl bg-surface-50 border border-surface-100">
                <div className="h-9 w-9 rounded-lg bg-success-50 flex items-center justify-center shrink-0">
                  <Lock className="h-[18px] w-[18px] text-success-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-900">SOC 2 Type II compliant architecture</p>
                  <p className="text-xs text-surface-500 mt-0.5">Enterprise-grade security controls and access management.</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 rounded-xl bg-surface-50 border border-surface-100">
                <div className="h-9 w-9 rounded-lg bg-success-50 flex items-center justify-center shrink-0">
                  <Eye className="h-[18px] w-[18px] text-success-600" />
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
                  <Database className="h-[18px] w-[18px] text-surface-600" />
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
                  <Sparkles className="h-[18px] w-[18px] text-surface-600" />
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
        <div className="max-w-3xl space-y-8">
          {/* Available Integrations */}
          <div>
            <h2 className="text-sm font-semibold text-surface-900 mb-3">Available</h2>
            <div className="space-y-3">
              {AVAILABLE_INTEGRATIONS.map((integration) => {
                const status = getIntegrationStatus(integration.type, integration.implemented);
                const connectedId = getConnectedId(integration.type);
                return (
                  <div
                    key={integration.type}
                    className={`rounded-2xl bg-surface-0 border p-5 flex items-center gap-4 transition-all ${
                      status === "connected"
                        ? "border-success-200 bg-success-50/30"
                        : "border-surface-200 hover:border-surface-300"
                    }`}
                  >
                    <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                      status === "connected"
                        ? "bg-success-100 text-success-600"
                        : "bg-surface-100 text-surface-600"
                    }`}>
                      {integration.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-surface-900">
                          {integration.name}
                        </h3>
                        {status === "connected" && (
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
                      {status === "available" && integration.href ? (
                        <Link
                          href={integration.href}
                          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors shadow-sm shadow-brand-600/20"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Import
                        </Link>
                      ) : status === "connected" && connectedId ? (
                        <button
                          onClick={() => disconnectIntegration(connectedId)}
                          className="flex items-center gap-1.5 rounded-xl border border-danger-200 px-4 py-2 text-xs font-medium text-danger-600 hover:bg-danger-50 transition-colors"
                        >
                          <Unplug className="h-3.5 w-3.5" />
                          Disconnect
                        </button>
                      ) : (
                        <Link
                          href={`/settings?connect=${integration.type}`}
                          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors shadow-sm shadow-brand-600/20"
                        >
                          Connect
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coming Soon Integrations */}
          <div>
            <h2 className="text-sm font-semibold text-surface-500 mb-3">Coming Soon</h2>
            <div className="space-y-3">
              {COMING_SOON_INTEGRATIONS.map((integration) => (
                <div
                  key={integration.type}
                  className="rounded-2xl bg-surface-50/50 border border-surface-200 p-5 flex items-center gap-4 opacity-75"
                >
                  <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 bg-surface-100 text-surface-400">
                    {integration.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-surface-600">
                        {integration.name}
                      </h3>
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-medium text-surface-500">
                        <Clock className="h-3 w-3" />
                        Coming Soon
                      </span>
                    </div>
                    <p className="text-xs text-surface-400 mt-0.5">
                      {integration.description}
                    </p>
                  </div>
                  <div>
                    <button
                      onClick={() =>
                        setNotifiedIntegrations((prev) => {
                          const next = new Set(prev);
                          next.add(integration.type);
                          return next;
                        })
                      }
                      disabled={notifiedIntegrations.has(integration.type)}
                      className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-medium transition-colors ${
                        notifiedIntegrations.has(integration.type)
                          ? "border-surface-200 text-surface-400 cursor-default bg-surface-50"
                          : "border-surface-300 text-surface-600 hover:bg-surface-100 hover:border-surface-400"
                      }`}
                    >
                      {notifiedIntegrations.has(integration.type) ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Notified
                        </>
                      ) : (
                        <>
                          <Bell className="h-3.5 w-3.5" />
                          Notify Me
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Billing Tab */}
      {activeTab === "billing" && (
        <BillingTab />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing Tab — fetches live subscription data and wires actions
// ---------------------------------------------------------------------------

interface BillingData {
  plan: "free" | "pro" | "team";
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  seats: number;
  usage: {
    scenarios: { used: number; limit: number };
    aiMessages: { used: number; limit: number };
    exports: { used: number; limit: number };
  };
}

const TIERS = [
  {
    key: "free" as const,
    name: "Free",
    price: "$0",
    period: "forever",
    features: [
      "1 scenario",
      "10 AI messages / month",
      "3 exports / month",
      "CSV import",
    ],
  },
  {
    key: "pro" as const,
    name: "Pro",
    price: "$29",
    period: "/month",
    popular: true,
    features: [
      "Unlimited scenarios",
      "Unlimited AI companion",
      "PDF & CSV export",
      "Data room",
      "Priority support",
    ],
  },
  {
    key: "team" as const,
    name: "Team",
    price: "$79",
    period: "/month + $20/seat",
    features: [
      "Everything in Pro",
      "Team collaboration",
      "Role-based access",
      "Audit log",
      "Custom integrations",
    ],
  },
];

function BillingTab() {
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { success: toastSuccess, error: toastError } = useToast();

  useEffect(() => {
    fetch("/api/billing")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setBilling(data))
      .catch(() => toastError("Failed to load billing information"))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpgrade = async (plan: "pro" | "team") => {
    setActionLoading(plan);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkout", plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toastError(data.error || "Failed to start checkout");
      }
    } catch {
      toastError("Unable to connect to billing service");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePortal = async () => {
    setActionLoading("portal");
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "portal" }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toastError(data.error || "Failed to open billing portal");
      }
    } catch {
      toastError("Unable to connect to billing service");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    setActionLoading("cancel");
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (res.ok) {
        const data = await res.json();
        setBilling((prev) =>
          prev ? { ...prev, cancelAtPeriodEnd: true, currentPeriodEnd: data.currentPeriodEnd } : prev
        );
        toastSuccess("Subscription will cancel at the end of the billing period");
      } else {
        const data = await res.json();
        toastError(data.error || "Failed to cancel subscription");
      }
    } catch {
      toastError("Unable to connect to billing service");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async () => {
    setActionLoading("reactivate");
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reactivate" }),
      });
      if (res.ok) {
        setBilling((prev) => (prev ? { ...prev, cancelAtPeriodEnd: false } : prev));
        toastSuccess("Subscription reactivated");
      } else {
        const data = await res.json();
        toastError(data.error || "Failed to reactivate subscription");
      }
    } catch {
      toastError("Unable to connect to billing service");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-surface-400" />
      </div>
    );
  }

  const currentPlan = billing?.plan ?? "free";
  const isActive = billing?.status === "active" || billing?.status === "trialing";
  const isPastDue = billing?.status === "past_due";

  return (
    <div className="max-w-3xl space-y-8">
      {/* Current plan status */}
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-surface-900">
            Current Plan
          </h2>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
              currentPlan === "free"
                ? "bg-surface-100 text-surface-600"
                : isPastDue
                  ? "bg-warning-50 text-warning-700"
                  : "bg-brand-50 text-brand-700"
            }`}
          >
            {currentPlan === "free" ? "Free" : currentPlan === "pro" ? "Pro" : "Team"}
            {isPastDue && " — Past Due"}
          </span>
        </div>

        {currentPlan === "free" ? (
          <p className="text-sm text-surface-500">
            You&apos;re on the free plan. Upgrade to unlock unlimited scenarios, AI
            companion, and export features.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-surface-500">
              {billing?.cancelAtPeriodEnd
                ? `Your ${currentPlan === "pro" ? "Pro" : "Team"} plan is active until ${
                    billing.currentPeriodEnd
                      ? new Date(billing.currentPeriodEnd).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "the end of the billing period"
                  }. After that, you'll be downgraded to Free.`
                : `Your ${currentPlan === "pro" ? "Pro" : "Team"} plan is active.${
                    billing?.currentPeriodEnd
                      ? ` Next billing date: ${new Date(billing.currentPeriodEnd).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}`
                      : ""
                  }`}
            </p>
            {isPastDue && (
              <div className="flex items-center gap-2 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Payment failed. Please update your payment method to keep your plan active.
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={handlePortal}
                disabled={actionLoading === "portal"}
                className="flex items-center gap-1.5 rounded-xl border border-surface-300 px-4 py-2 text-xs font-medium text-surface-700 hover:bg-surface-50 hover:border-surface-400 transition-colors disabled:opacity-50"
              >
                {actionLoading === "portal" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                Manage Billing
              </button>
              {billing?.cancelAtPeriodEnd ? (
                <button
                  onClick={handleReactivate}
                  disabled={actionLoading === "reactivate"}
                  className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                >
                  {actionLoading === "reactivate" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Reactivate
                </button>
              ) : (
                <button
                  onClick={handleCancel}
                  disabled={actionLoading === "cancel"}
                  className="flex items-center gap-1.5 rounded-xl border border-danger-200 px-4 py-2 text-xs font-medium text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-50"
                >
                  {actionLoading === "cancel" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Cancel Subscription
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Usage (for non-free plans) */}
      {billing && currentPlan !== "free" && (
        <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
          <h2 className="text-base font-semibold text-surface-900 mb-4">Usage This Month</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Scenarios", ...billing.usage.scenarios },
              { label: "AI Messages", ...billing.usage.aiMessages },
              { label: "Exports", ...billing.usage.exports },
            ].map((u) => (
              <div key={u.label} className="rounded-xl bg-surface-50 p-4">
                <p className="text-xs text-surface-500 mb-1">{u.label}</p>
                <p className="text-lg font-bold text-surface-900 tabular-nums">
                  {u.used}
                  <span className="text-sm font-normal text-surface-400">
                    {u.limit === -1 ? " / unlimited" : ` / ${u.limit}`}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pricing tiers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        {TIERS.map((tier) => {
          const isCurrent = tier.key === currentPlan;
          return (
            <div
              key={tier.key}
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
                disabled={isCurrent || actionLoading === tier.key}
                onClick={() => {
                  if (tier.key !== "free") handleUpgrade(tier.key);
                }}
                className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                  isCurrent
                    ? "bg-surface-100 text-surface-400 cursor-not-allowed"
                    : tier.popular
                      ? "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20 hover:shadow-md hover:shadow-brand-600/25 disabled:opacity-50"
                      : tier.key === "free"
                        ? "bg-surface-100 text-surface-400 cursor-not-allowed"
                        : "border border-surface-300 text-surface-700 hover:bg-surface-50 hover:border-surface-400 disabled:opacity-50"
                }`}
              >
                {isCurrent ? (
                  "Current Plan"
                ) : actionLoading === tier.key ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : tier.key === "free" ? (
                  "Free Forever"
                ) : (
                  "Upgrade"
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
