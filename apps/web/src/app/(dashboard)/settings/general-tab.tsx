"use client";

import {
  Loader2,
  Check,
  Save,
  AlertCircle,
} from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import {
  type CompanyProfile,
  STAGE_OPTIONS,
  BUSINESS_MODEL_OPTIONS,
  FISCAL_YEAR_END_OPTIONS,
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
            onClick={() => saveCompany()}
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
          <Input
            label="Company name"
            type="text"
            value={company.name}
            onChange={(e) => setCompany((c) => ({ ...c, name: e.target.value }))}
            placeholder="My Startup Inc."
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Stage"
              value={company.stage}
              onChange={(e) => setCompany((c) => ({ ...c, stage: e.target.value }))}
            >
              {STAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
            <Select
              label="Business Model"
              value={company.businessModel}
              onChange={(e) => setCompany((c) => ({ ...c, businessModel: e.target.value }))}
            >
              {BUSINESS_MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Industry"
              type="text"
              value={company.industry ?? ""}
              onChange={(e) => setCompany((c) => ({ ...c, industry: e.target.value || null }))}
              placeholder="e.g. Fintech, Healthcare, EdTech"
            />
            <Select
              label="Currency"
              value={company.currency}
              onChange={(e) => setCompany((c) => ({ ...c, currency: e.target.value }))}
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Locale"
              value={company.locale}
              onChange={(e) => setCompany((c) => ({ ...c, locale: e.target.value }))}
            >
              {LOCALE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
            <Input
              label="Timezone"
              type="text"
              value={company.timezone}
              onChange={(e) => setCompany((c) => ({ ...c, timezone: e.target.value }))}
              placeholder="America/New_York"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Fiscal Year End"
              value={company.fiscalYearEnd}
              onChange={(e) => setCompany((c) => ({ ...c, fiscalYearEnd: Number(e.target.value) }))}
            >
              {FISCAL_YEAR_END_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
            <Select
              label="Data Region"
              value={company.region}
              onChange={(e) => setCompany((c) => ({ ...c, region: e.target.value }))}
            >
              {REGION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

    </div>
  );
}
