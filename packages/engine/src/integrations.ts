// Integration provider framework
// Pure TypeScript plugin interface for data integrations — no DB dependencies.

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export interface SyncOptions {
  since?: Date;
  fullSync?: boolean;
}

export interface MappedTransaction {
  date: string;
  amount: number;
  description: string;
  category?: string;
  externalId: string;
  metadata?: Record<string, unknown>;
}

export interface SyncResult {
  transactions: MappedTransaction[];
  syncedAt: Date;
  hasMore: boolean;
  cursor?: string;
}

// ---------------------------------------------------------------------------
// Core provider interface
// ---------------------------------------------------------------------------

export interface IntegrationProvider {
  readonly type: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string; // lucide icon name
  readonly status: "available" | "coming_soon";

  connect?(
    config: Record<string, unknown>,
  ): Promise<{ success: boolean; error?: string }>;
  disconnect?(): Promise<void>;
  sync?(options: SyncOptions): Promise<SyncResult>;
  mapTransactions?(rawData: unknown[]): MappedTransaction[];
}

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

export class ProviderRegistry {
  private providers = new Map<string, IntegrationProvider>();

  register(provider: IntegrationProvider): void {
    this.providers.set(provider.type, provider);
  }

  get(type: string): IntegrationProvider | undefined {
    return this.providers.get(type);
  }

  getAll(): IntegrationProvider[] {
    return Array.from(this.providers.values());
  }

  getAvailable(): IntegrationProvider[] {
    return this.getAll().filter((p) => p.status === "available");
  }

  getComingSoon(): IntegrationProvider[] {
    return this.getAll().filter((p) => p.status === "coming_soon");
  }
}

// ---------------------------------------------------------------------------
// Default provider stubs (coming soon)
// ---------------------------------------------------------------------------

const quickbooksProvider: IntegrationProvider = {
  type: "quickbooks",
  name: "QuickBooks",
  description: "Sync your QuickBooks accounting data automatically",
  icon: "BookOpen",
  status: "coming_soon",
};

const xeroProvider: IntegrationProvider = {
  type: "xero",
  name: "Xero",
  description: "Connect your Xero account for automatic data sync",
  icon: "RefreshCw",
  status: "coming_soon",
};

const freshbooksProvider: IntegrationProvider = {
  type: "freshbooks",
  name: "FreshBooks",
  description: "Import invoices and expenses from FreshBooks",
  icon: "BookText",
  status: "coming_soon",
};

const plaidProvider: IntegrationProvider = {
  type: "plaid",
  name: "Plaid",
  description: "Link your bank accounts for real-time transaction data",
  icon: "Landmark",
  status: "coming_soon",
};

const mercuryProvider: IntegrationProvider = {
  type: "mercury",
  name: "Mercury",
  description: "Sync transactions from your Mercury banking account",
  icon: "Wallet",
  status: "coming_soon",
};

const gustoProvider: IntegrationProvider = {
  type: "gusto",
  name: "Gusto",
  description: "Import payroll and employee data from Gusto",
  icon: "Users",
  status: "coming_soon",
};

const stripeProvider: IntegrationProvider = {
  type: "stripe",
  name: "Stripe",
  description: "Sync payment and revenue data from Stripe",
  icon: "CreditCard",
  status: "coming_soon",
};

// ---------------------------------------------------------------------------
// Available provider: CSV Import
// ---------------------------------------------------------------------------

const csvImportProvider: IntegrationProvider = {
  type: "csv_import",
  name: "CSV Import",
  description: "Import transactions from bank statements and spreadsheets",
  icon: "FileSpreadsheet",
  status: "available",
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();

  registry.register(csvImportProvider);
  registry.register(quickbooksProvider);
  registry.register(xeroProvider);
  registry.register(freshbooksProvider);
  registry.register(plaidProvider);
  registry.register(mercuryProvider);
  registry.register(gustoProvider);
  registry.register(stripeProvider);

  return registry;
}
