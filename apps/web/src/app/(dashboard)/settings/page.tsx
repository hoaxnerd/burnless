"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { apiFetch } from "@/lib/api-fetch";
import { KEYS, revalidate } from "@/lib/swr";
import { toUserMessage } from "@/lib/api-error";
import { useAiFlags } from "@/components/ai/ai-feature-context";
import { type CompanyProfile, type ConnectedIntegration, visibleTabs } from "./settings-data";
import { useCapabilities } from "@/components/providers/capability-context";
import { GeneralTab } from "./general-tab";
import { AiFeaturesTab } from "./ai-features-tab";
import { AiDashboardTab } from "./ai-dashboard-tab";
import { IntegrationsTab } from "./integrations-tab";
import { BillingTab } from "./billing-tab";
import { InviteCodesTab } from "./invite-codes-tab";
import { SecurityTab } from "./security-tab";
import { Modal } from "@/components/ui/modal";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<
    "general" | "security" | "ai" | "ai-dashboard" | "integrations" | "invite-codes" | "billing"
  >("general");
  const { flags, updateFlags, loaded: aiLoaded, credits, providerConfig } = useAiFlags();
  // Task 12: hide capability-gated tabs (defense-in-depth; server guards authoritative).
  const caps = useCapabilities();

  // Honor a `?tab=` deep-link (e.g. /settings?tab=security from the sidebar claim link).
  const searchParams = useSearchParams();
  useEffect(() => {
    const t = searchParams.get("tab");
    const valid = ["general", "security", "ai", "ai-dashboard", "integrations", "invite-codes", "billing"];
    if (t && valid.includes(t)) setActiveTab(t as typeof activeTab);
  }, [searchParams]);

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
    fiscalYearEnd: 12,
  });
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Track the currency as loaded from the server (used to revert on cancel)
  const [loadedCurrency, setLoadedCurrency] = useState<string>("");

  // Confirm dialog state — generic: holds whatever message the API returns
  type ConfirmState = { open: false } | { open: true; message: string };
  const [confirmState, setConfirmState] = useState<ConfirmState>({ open: false });

  const [notifiedIntegrations, setNotifiedIntegrations] = useState<Set<string>>(new Set());

  // ── Reads on the shared SWR cache (DFL-01) ──────────────────────────────────
  // Company profile is read-only here; the editable `company` state is seeded
  // from this read below. The integrations list is derived straight from SWR so
  // a connect/disconnect mutation revalidates it without a manual reload.
  const { data: companyData, isLoading: companyLoading } =
    useSWR<CompanyProfile & { currency?: string }>(KEYS.company);
  const companyLoaded = !companyLoading && companyData !== undefined;

  const { data: integrationsData } = useSWR<ConnectedIntegration[]>(KEYS.integrations);
  const connectedIntegrations = integrationsData ?? [];

  // Seed the editable company form once the read resolves (and re-seed if the
  // server copy changes). Local edits live in `company`; the SWR entry stays the
  // canonical server snapshot.
  useEffect(() => {
    if (!companyData) return;
    const currency = companyData.currency || "USD";
    setCompany({
      name: companyData.name || "",
      stage: companyData.stage || "pre_seed",
      currency,
      locale: companyData.locale || "en-US",
      timezone: companyData.timezone || "America/New_York",
      region: companyData.region || "us-east",
      industry: companyData.industry,
      businessModel: companyData.businessModel || "saas",
      fiscalYearEnd: companyData.fiscalYearEnd ?? 12,
    });
    setLoadedCurrency(currency);
  }, [companyData]);

  const reloadIntegrations = () => revalidate(KEYS.integrations);

  // Save company profile — accepts an optional confirm flag for the 409 retry path
  const saveCompany = async (confirm = false) => {
    setSaving(true);
    setSaveError(null);
    try {
      const url = confirm ? "/api/company?confirm=true" : "/api/company";
      const res = await apiFetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(company),
      });
      const data = await res.json();

      if (res.status === 409 && data.requiresConfirmation) {
        // API is asking for explicit confirmation — show the generic confirm dialog
        setConfirmState({ open: true, message: toUserMessage(data) });
        return;
      }
      if (!res.ok) {
        setSaveError(toUserMessage(data) || "Failed to save");
        return;
      }
      // Success
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      if (data.currency) {
        setLoadedCurrency(data.currency);
      }
      setConfirmState({ open: false });
      // Keep the shared cache in sync with the saved profile (PMR-1).
      void revalidate(KEYS.company);
    } catch {
      setSaveError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Disconnect integration
  const disconnectIntegration = async (id: string) => {
    const res = await apiFetch(`/api/integrations/${id}`, { method: "DELETE" });
    if (res.ok) reloadIntegrations();
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
      <div className="flex gap-1 border-b border-surface-200 mb-6 sm:mb-8 overflow-x-auto">
        {visibleTabs(caps).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
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
        <GeneralTab
          company={company}
          setCompany={setCompany}
          companyLoaded={companyLoaded}
          saving={saving}
          saveSuccess={saveSuccess}
          saveError={saveError}
          saveCompany={saveCompany}
        />
      )}

      {/* Security Tab */}
      {activeTab === "security" && <SecurityTab />}

      {/* AI Features Tab (SET-07 Path B — shipped). Gated on aiLoaded so the
          tab renders against fully-resolved flags from the live useAiFlags
          context. writeMode is not surfaced here — per-user AI tool permissions
          govern (two-gates); company default stays `confirm`. */}
      {activeTab === "ai" && aiLoaded && (
        <AiFeaturesTab flags={flags} updateFlags={updateFlags} credits={credits} providerConfig={providerConfig} />
      )}

      {/* AI Dashboard Tab (SET-07 Path B — shipped) */}
      {activeTab === "ai-dashboard" && <AiDashboardTab />}

      {/* Integrations Tab */}
      {activeTab === "integrations" && (
        <IntegrationsTab
          connectedIntegrations={connectedIntegrations}
          notifiedIntegrations={notifiedIntegrations}
          setNotifiedIntegrations={setNotifiedIntegrations}
          disconnectIntegration={disconnectIntegration}
          getIntegrationStatus={getIntegrationStatus}
          getConnectedId={getConnectedId}
        />
      )}

      {/* Invite Codes Tab — Task 12: capability-gated (defense-in-depth) */}
      {activeTab === "invite-codes" && caps.inviteCodes && <InviteCodesTab />}

      {/* Billing Tab — Task 12: capability-gated (defense-in-depth) */}
      {activeTab === "billing" && caps.billing && (
        <BillingTab />
      )}

      {/* Generic confirmable-error dialog — renders whatever message the API returns */}
      <Modal
        open={confirmState.open}
        onClose={() => {
          setCompany((prev) => ({ ...prev, currency: loadedCurrency }));
          setConfirmState({ open: false });
        }}
        title="Confirm change"
        size="md"
      >
        {confirmState.open && (
          <>
            <p className="text-sm text-surface-700 mb-6">{confirmState.message}</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCompany((prev) => ({ ...prev, currency: loadedCurrency }));
                  setConfirmState({ open: false });
                }}
                className="rounded-xl border border-surface-300 bg-surface-0 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setConfirmState({ open: false });
                  saveCompany(true);
                }}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
              >
                Confirm
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
