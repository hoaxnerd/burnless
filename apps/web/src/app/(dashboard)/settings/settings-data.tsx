import {
  BookOpen,
  FileSpreadsheet,
  Landmark,
  CreditCard,
  Building2,
  DollarSign,
} from "lucide-react";
import { CURRENCIES, DATA_REGIONS, type DataRegion } from "@burnless/types";

export interface IntegrationDef {
  type: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  href?: string;
  implemented: boolean;
}

export const AVAILABLE_INTEGRATIONS: IntegrationDef[] = [
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

export const COMING_SOON_INTEGRATIONS: IntegrationDef[] = [
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

export interface ConnectedIntegration {
  id: string;
  type: string;
  status: string;
  lastSyncAt: string | null;
}

export interface CompanyProfile {
  name: string;
  stage: string;
  currency: string;
  locale: string;
  timezone: string;
  region: string;
  industry: string | null;
  businessModel: string;
}

export const STAGE_OPTIONS = [
  { value: "pre_seed", label: "Pre-seed" },
  { value: "seed", label: "Seed" },
  { value: "series_a", label: "Series A" },
  { value: "series_b", label: "Series B" },
  { value: "series_c_plus", label: "Series C+" },
  { value: "bootstrapped", label: "Bootstrapped" },
];

export const CURRENCY_OPTIONS = Object.values(CURRENCIES).map((c) => ({
  value: c.code,
  label: `${c.code} (${c.symbol})`,
}));

export const LOCALE_OPTIONS = [
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

export const REGION_OPTIONS = (Object.entries(DATA_REGIONS) as [DataRegion, { name: string; location: string }][]).map(
  ([key, val]) => ({
    value: key,
    label: `${val.name} (${val.location})`,
  })
);

export const tabs = [
  { key: "general" as const, label: "General" },
  { key: "ai" as const, label: "AI Features" },
  { key: "ai-dashboard" as const, label: "AI Dashboard" },
  { key: "integrations" as const, label: "Integrations" },
  { key: "invite-codes" as const, label: "Invite Codes" },
  { key: "billing" as const, label: "Billing" },
];
