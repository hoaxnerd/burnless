import {
  BookOpen,
  FileSpreadsheet,
  Landmark,
  CreditCard,
  Building2,
  DollarSign,
  Plug,
} from "lucide-react";
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
// The integrations catalog is DERIVED from `integrationRegistry.catalog()` — the
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
 * Source of truth for the Integrations catalog. Merges the static CSV-import
 * entry with every connector from `integrationRegistry.catalog()`, mapping the
 * registry's `status` ("available" | "coming_soon") to the UI's `implemented`
 * flag and resolving the JSX icon by `type`. Drift between the registry and the
 * integrations UI is impossible by construction (and asserted by a test).
 * Callers may filter on `implemented` for the Available vs Coming Soon sections.
 */
export function integrationsCatalog(): IntegrationDef[] {
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

export const AVAILABLE_INTEGRATIONS: IntegrationDef[] = integrationsCatalog().filter(
  (i) => i.implemented,
);

export const COMING_SOON_INTEGRATIONS: IntegrationDef[] = integrationsCatalog().filter(
  (i) => !i.implemented,
);

export interface ConnectedIntegration {
  id: string;
  type: string;
  status: string;
  lastSyncAt: string | null;
  /** Last sync failure, projected from `metadata.sync.lastError` (drives the
   *  connected-integration health view). Null when the last sync succeeded. */
  lastError: string | null;
}

/** Raw `/api/integrations` row shape — the GET returns the DB rows verbatim, so
 *  `metadata.sync.lastError` is the source for the projected `lastError`. */
export interface IntegrationRow {
  id: string;
  type: string;
  status: string;
  lastSyncAt: string | null;
  metadata?: { sync?: { lastError?: string | null } | null } | null;
}

/** Project the raw API rows into `ConnectedIntegration[]`, surfacing the last
 *  sync error from sync-state metadata so the connected health view can render. */
export function toConnectedIntegrations(rows: IntegrationRow[]): ConnectedIntegration[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    lastSyncAt: row.lastSyncAt,
    lastError: row.metadata?.sync?.lastError ?? null,
  }));
}
