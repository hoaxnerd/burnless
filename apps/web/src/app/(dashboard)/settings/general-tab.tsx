"use client";

import {
  Loader2,
  Check,
  Save,
  AlertCircle,
  Shield,
  Lock,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui";
import {
  type CompanyProfile,
  STAGE_OPTIONS,
  CURRENCY_OPTIONS,
  LOCALE_OPTIONS,
  REGION_OPTIONS,
} from "./settings-data";

interface GeneralTabProps {
  company: CompanyProfile;
  setCompany: React.Dispatch<React.SetStateAction<CompanyProfile>>;
  companyLoaded: boolean;
  saving: boolean;
  saveSuccess: boolean;
  saveError: string | null;
  saveCompany: () => void;
}

export function GeneralTab({
  company,
  setCompany,
  companyLoaded,
  saving,
  saveSuccess,
  saveError,
  saveCompany,
}: GeneralTabProps) {
  return (
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
  );
}
