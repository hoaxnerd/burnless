"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { toUserMessage } from "@/lib/api-error";
import { useAiFlags } from "@/components/ai/ai-feature-context";
import { type CompanyProfile, type ConnectedIntegration, tabs } from "./settings-data";
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
  const [companyLoaded, setCompanyLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Track the currency as loaded from the server (used to revert on cancel)
  const [loadedCurrency, setLoadedCurrency] = useState<string>("");

  // Confirm dialog state — generic: holds whatever message the API returns
  type ConfirmState = { open: false } | { open: true; message: string };
  const [confirmState, setConfirmState] = useState<ConfirmState>({ open: false });

  // Integrations state
  const [connectedIntegrations, setConnectedIntegrations] = useState<ConnectedIntegration[]>([]);
  const [_integrationsLoaded, setIntegrationsLoaded] = useState(false);
  const [notifiedIntegrations, setNotifiedIntegrations] = useState<Set<string>>(new Set());

  // Load company profile
  useEffect(() => {
    apiFetch("/api/company")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          const currency = data.currency || "USD";
          setCompany({
            name: data.name || "",
            stage: data.stage || "pre_seed",
            currency,
            locale: data.locale || "en-US",
            timezone: data.timezone || "America/New_York",
            region: data.region || "us-east",
            industry: data.industry,
            businessModel: data.businessModel || "saas",
            fiscalYearEnd: data.fiscalYearEnd ?? 12,
          });
          setLoadedCurrency(currency);
        }
        setCompanyLoaded(true);
      })
      .catch(() => setCompanyLoaded(true));
  }, []);

  // Load integrations
  const loadIntegrations = useCallback(() => {
    apiFetch("/api/integrations")
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
    } catch {
      setSaveError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Disconnect integration
  const disconnectIntegration = async (id: string) => {
    const res = await apiFetch(`/api/integrations/${id}`, { method: "DELETE" });
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
      <div className="flex gap-1 border-b border-surface-200 mb-6 sm:mb-8 overflow-x-auto">
        {tabs.map((tab) => (
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

      {/* TODO: Re-enable AI Features and AI Dashboard tabs in a later release */}
      {/* {activeTab === "ai" && aiLoaded && (
        <AiFeaturesTab flags={flags} updateFlags={updateFlags} credits={credits} providerConfig={providerConfig} />
      )} */}

      {/* {activeTab === "ai-dashboard" && <AiDashboardTab />} */}

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

      {/* Invite Codes Tab */}
      {activeTab === "invite-codes" && <InviteCodesTab />}

      {/* Billing Tab */}
      {activeTab === "billing" && (
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
