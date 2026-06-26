import {
  BookOpen,
  FileSpreadsheet,
  Landmark,
  CreditCard,
  Building2,
  DollarSign,
  Plug,
} from "lucide-react";
import { CURRENCIES, DATA_REGIONS, type DataRegion } from "@burnless/types";
import type { Capabilities } from "@/lib/capabilities";
import { integrationRegistry, registerConnectors } from "@/lib/integrations/registry";

export interface IntegrationDef {
  type: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  href?: string;
  implemented: boolean;
}

// ── Integration catalog (C1.6) ──────────────────────────────────────────────
// The settings catalog is DERIVED from `integrationRegistry.catalog()` — the
// single source of truth — so connectors can never silently drift out of the UI
// (guarded by integrations-catalog.test.ts). The registry's `icon` is a lucide
// NAME string; the tiles need JSX, so we keep one icon map keyed by `type` and
// look up the rendered glyph by type. The only non-connector entry is the static
// CSV-import tile (it is not a registry connector — it is a first-party import
// surface), which we prepend.

/** Static, always-available entries that are NOT registry connectors. */
const STATIC_AVAILABLE: IntegrationDef[] = [
  {
    type: "csv_import",
    name: "CSV Import",
    description: "Import transactions from bank statements and spreadsheets",
    icon: <FileSpreadsheet className="h-5 w-5" />,
    href: "/import",
    implemented: true,
  },
];

/** JSX icon per connector `type` (registry stores lucide NAMES, the UI needs JSX). */
const INTEGRATION_ICONS: Record<string, React.ReactNode> = {
  stripe: <CreditCard className="h-5 w-5" />,
  plaid: <Landmark className="h-5 w-5" />,
  quickbooks: <BookOpen className="h-5 w-5" />,
  xero: <BookOpen className="h-5 w-5" />,
  freshbooks: <BookOpen className="h-5 w-5" />,
  mercury: <Building2 className="h-5 w-5" />,
  gusto: <DollarSign className="h-5 w-5" />,
};

const FALLBACK_ICON = <Plug className="h-5 w-5" />;

/**
 * Source of truth for the Settings → Integrations catalog. Merges the static
 * CSV-import entry with every connector from `integrationRegistry.catalog()`,
 * mapping the registry's `status` ("available" | "coming_soon") to the UI's
 * `implemented` flag and resolving the JSX icon by `type`. Drift between the
 * registry and the settings UI is impossible by construction (and asserted by a
 * test). Callers may filter on `implemented` for the Available vs Coming Soon
 * sections.
 */
export function catalogForSettings(): IntegrationDef[] {
  registerConnectors();
  const fromRegistry: IntegrationDef[] = integrationRegistry.catalog().map((c) => ({
    type: c.type,
    name: c.displayName,
    description: c.description,
    icon: INTEGRATION_ICONS[c.type] ?? FALLBACK_ICON,
    implemented: c.status === "available",
  }));
  return [...STATIC_AVAILABLE, ...fromRegistry];
}

export const AVAILABLE_INTEGRATIONS: IntegrationDef[] = catalogForSettings().filter(
  (i) => i.implemented,
);

export const COMING_SOON_INTEGRATIONS: IntegrationDef[] = catalogForSettings().filter(
  (i) => !i.implemented,
);

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
  fiscalYearEnd: number;
}

export const BUSINESS_MODEL_OPTIONS = [
  { value: "saas", label: "SaaS" },
  { value: "marketplace", label: "Marketplace" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "services", label: "Services" },
  { value: "hardware", label: "Hardware" },
  { value: "other", label: "Other" },
];

export const FISCAL_YEAR_END_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

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
  { key: "security" as const, label: "Security" },
  // SET-07 (Path B): AI Features + AI Dashboard tabs are SHIPPED for launch.
  // Conscious decision — the surface (provider selector, data mode, per-feature
  // toggles, credits, observability) is complete and renders against the live
  // useAiFlags context. writeMode is governed by per-user AI tool permissions
  // (two-gates contract); the company-level writeMode default is `confirm`.
  { key: "ai" as const, label: "AI Features" },
  { key: "ai-dashboard" as const, label: "AI Dashboard" },
  { key: "integrations" as const, label: "Integrations" },
  { key: "invite-codes" as const, label: "Invite Codes" },
  { key: "billing" as const, label: "Billing" },
];

/**
 * Task 12 (S1 edition/capability spine): hide capability-gated tabs.
 * Defense-in-depth — server guards (requireCapability) remain authoritative.
 * Pure helper so it can be unit-tested without the provider.
 */
export function visibleTabs(caps: Capabilities) {
  return tabs.filter((t) => {
    if (t.key === "billing") return caps.billing;
    if (t.key === "invite-codes") return caps.inviteCodes;
    return true;
  });
}
