/// <reference path="./vendor.d.ts" />
/**
 * Bank connector abstraction layer.
 *
 * Provides a unified interface for connecting to bank accounts across regions:
 * - Plaid: US, Canada, UK, EU
 * - Account Aggregator: India (via Setu/AA framework)
 *
 * Each connector normalizes bank data into a common transaction format.
 */

import type { CurrencyCode, DataRegion } from "@burnless/types";

// ── Types ───────────────────────────────────────────────────────────────────

export type BankConnectorType = "plaid" | "account_aggregator" | "open_banking";

export interface BankAccount {
  id: string;
  /** External account ID from the provider. */
  externalId: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment" | "other";
  currency: CurrencyCode;
  /** Current balance in the account's currency. */
  balance: number;
  institution: string;
  lastSynced: Date | null;
}

export interface BankTransaction {
  id: string;
  accountId: string;
  date: Date;
  amount: number;
  currency: CurrencyCode;
  description: string;
  category: string | null;
  /** Merchant name when available. */
  merchant: string | null;
  /** Whether the transaction is pending. */
  pending: boolean;
  externalId: string;
  metadata?: Record<string, unknown>;
}

export interface BankSyncResult {
  accounts: BankAccount[];
  transactions: BankTransaction[];
  syncedAt: Date;
  cursor?: string;
  hasMore: boolean;
}

export interface LinkTokenOptions {
  userId: string;
  /** Redirect URL for OAuth-based flows. */
  redirectUrl?: string;
  /** Institution to pre-select. */
  institutionId?: string;
}

// ── Connector Interface ─────────────────────────────────────────────────────

export interface BankConnector {
  readonly type: BankConnectorType;
  readonly name: string;
  /** Regions where this connector is available. */
  readonly supportedRegions: DataRegion[];
  /** Currencies this connector supports. */
  readonly supportedCurrencies: CurrencyCode[];

  /** Create a link token for the frontend connection flow. */
  createLinkToken(options: LinkTokenOptions): Promise<{ linkToken: string; expiration: Date }>;

  /** Exchange a public token from the frontend for a persistent access token. */
  exchangeToken(publicToken: string): Promise<{ accessToken: string; itemId: string }>;

  /** Fetch accounts for a connected item. */
  getAccounts(accessToken: string): Promise<BankAccount[]>;

  /** Sync transactions (incremental with cursor, or full). */
  syncTransactions(
    accessToken: string,
    options?: { cursor?: string; startDate?: Date; endDate?: Date }
  ): Promise<BankSyncResult>;

  /** Remove the connection. */
  removeConnection(accessToken: string): Promise<void>;
}

// ── Plaid Connector ─────────────────────────────────────────────────────────

export class PlaidBankConnector implements BankConnector {
  readonly type = "plaid" as const;
  readonly name = "Plaid";
  readonly supportedRegions: DataRegion[] = ["us-east", "eu-west"];
  readonly supportedCurrencies: CurrencyCode[] = ["USD", "CAD", "GBP", "EUR"];

  constructor(
    private readonly config: {
      clientId: string;
      secret: string;
      environment: "sandbox" | "development" | "production";
    }
  ) {}

  async createLinkToken(options: LinkTokenOptions) {
    const client = await this.getClient();
    const response = await client.linkTokenCreate({
      user: { client_user_id: options.userId },
      client_name: "Burnless",
      products: ["transactions"],
      country_codes: ["US", "CA", "GB", "FR", "DE", "NL", "IE", "ES"],
      language: "en",
      redirect_uri: options.redirectUrl,
      institution_id: options.institutionId,
    });
    return {
      linkToken: response.data.link_token,
      expiration: new Date(response.data.expiration),
    };
  }

  async exchangeToken(publicToken: string) {
    const client = await this.getClient();
    const response = await client.itemPublicTokenExchange({ public_token: publicToken });
    return { accessToken: response.data.access_token, itemId: response.data.item_id };
  }

  async getAccounts(accessToken: string): Promise<BankAccount[]> {
    const client = await this.getClient();
    const response = await client.accountsGet({ access_token: accessToken });
    return response.data.accounts.map((acc: any) => ({
      id: acc.account_id,
      externalId: acc.account_id,
      name: acc.name,
      type: this.mapAccountType(acc.type),
      currency: (acc.balances.iso_currency_code as CurrencyCode) || "USD",
      balance: acc.balances.current ?? 0,
      institution: response.data.item.institution_id || "Unknown",
      lastSynced: new Date(),
    }));
  }

  async syncTransactions(
    accessToken: string,
    options?: { cursor?: string; startDate?: Date; endDate?: Date }
  ): Promise<BankSyncResult> {
    const client = await this.getClient();

    if (options?.cursor) {
      // Incremental sync
      const response = await client.transactionsSync({
        access_token: accessToken,
        cursor: options.cursor,
      });
      return {
        accounts: [],
        transactions: response.data.added.map((t: any) => this.mapTransaction(t)),
        syncedAt: new Date(),
        cursor: response.data.next_cursor,
        hasMore: response.data.has_more,
      };
    }

    // Full sync
    const start = options?.startDate ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const end = options?.endDate ?? new Date();
    const response = await client.transactionsGet({
      access_token: accessToken,
      start_date: start.toISOString().split("T")[0]!,
      end_date: end.toISOString().split("T")[0]!,
    });

    return {
      accounts: [],
      transactions: response.data.transactions.map((t: any) => this.mapTransaction(t)),
      syncedAt: new Date(),
      hasMore: response.data.total_transactions > response.data.transactions.length,
    };
  }

  async removeConnection(accessToken: string): Promise<void> {
    const client = await this.getClient();
    await client.itemRemove({ access_token: accessToken });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapTransaction(t: any): BankTransaction {
    return {
      id: t.transaction_id,
      accountId: t.account_id,
      date: new Date(t.date),
      amount: -t.amount, // Plaid: positive = debit; we flip to match our convention
      currency: (t.iso_currency_code as CurrencyCode) || "USD",
      description: t.name || t.merchant_name || "",
      category: t.personal_finance_category?.primary || t.category?.[0] || null,
      merchant: t.merchant_name || null,
      pending: t.pending || false,
      externalId: t.transaction_id,
      metadata: { plaidCategory: t.personal_finance_category },
    };
  }

  private mapAccountType(type: string): BankAccount["type"] {
    const map: Record<string, BankAccount["type"]> = {
      depository: "checking",
      credit: "credit",
      investment: "investment",
      loan: "other",
    };
    return map[type] || "other";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getClient(): Promise<any> {
    const { PlaidApi, Configuration, PlaidEnvironments } = await import("plaid");
    const configuration = new Configuration({
      basePath: PlaidEnvironments[this.config.environment],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": this.config.clientId,
          "PLAID-SECRET": this.config.secret,
        },
      },
    });
    return new PlaidApi(configuration);
  }
}

// ── Account Aggregator Connector (India) ────────────────────────────────────

export class AccountAggregatorConnector implements BankConnector {
  readonly type = "account_aggregator" as const;
  readonly name = "Account Aggregator (India)";
  readonly supportedRegions: DataRegion[] = ["ap-south"];
  readonly supportedCurrencies: CurrencyCode[] = ["INR"];

  constructor(
    private readonly config: {
      /** AA provider API base URL (e.g., Setu, OneMoney). */
      apiBaseUrl: string;
      clientId: string;
      clientSecret: string;
    }
  ) {}

  async createLinkToken(options: LinkTokenOptions) {
    // AA uses a consent flow — we create a consent request
    const response = await fetch(`${this.config.apiBaseUrl}/consents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": this.config.clientId,
        "x-client-secret": this.config.clientSecret,
      },
      body: JSON.stringify({
        detail: {
          consentStart: new Date().toISOString(),
          consentExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          consentMode: "STORE",
          fetchType: "PERIODIC",
          frequency: { unit: "DAY", value: 1 },
          dataFilter: [{ type: "TRANSACTIONAMOUNT", operator: ">=", value: "0" }],
          dataRange: {
            from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
            to: new Date().toISOString(),
          },
          purpose: { code: "101", text: "Financial planning and analysis" },
        },
        redirectUrl: options.redirectUrl || "",
        context: [{ key: "userId", value: options.userId }],
      }),
    });
    const data = await response.json();
    return {
      linkToken: data.id || data.consentHandle,
      expiration: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  async exchangeToken(consentId: string) {
    // After consent approval, we fetch the session
    const response = await fetch(`${this.config.apiBaseUrl}/consents/${consentId}`, {
      headers: {
        "x-client-id": this.config.clientId,
        "x-client-secret": this.config.clientSecret,
      },
    });
    const data = await response.json();
    return {
      accessToken: data.sessionId || data.dataSessionId,
      itemId: consentId,
    };
  }

  async getAccounts(accessToken: string): Promise<BankAccount[]> {
    const response = await fetch(`${this.config.apiBaseUrl}/sessions/${accessToken}/accounts`, {
      headers: {
        "x-client-id": this.config.clientId,
        "x-client-secret": this.config.clientSecret,
      },
    });
    const data = await response.json();
    return (data.accounts || []).map((acc: Record<string, unknown>) => ({
      id: String(acc.maskedAccNumber || acc.id),
      externalId: String(acc.maskedAccNumber || acc.id),
      name: String(acc.type || "Bank Account"),
      type: "checking" as const,
      currency: "INR" as CurrencyCode,
      balance: Number(acc.balance || 0),
      institution: String(acc.fiName || "Unknown"),
      lastSynced: new Date(),
    }));
  }

  async syncTransactions(
    accessToken: string,
    options?: { startDate?: Date; endDate?: Date }
  ): Promise<BankSyncResult> {
    const start = options?.startDate ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const end = options?.endDate ?? new Date();

    const response = await fetch(`${this.config.apiBaseUrl}/sessions/${accessToken}/data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": this.config.clientId,
        "x-client-secret": this.config.clientSecret,
      },
      body: JSON.stringify({
        dataRange: { from: start.toISOString(), to: end.toISOString() },
      }),
    });
    const data = await response.json();
    const transactions: BankTransaction[] = (data.transactions || []).map(
      (t: Record<string, unknown>) => ({
        id: String(t.txnId || crypto.randomUUID()),
        accountId: String(t.maskedAccNumber || ""),
        date: new Date(String(t.valueDate || t.transactionTimestamp)),
        amount: Number(t.amount || 0) * (t.type === "DEBIT" ? -1 : 1),
        currency: "INR" as CurrencyCode,
        description: String(t.narration || ""),
        category: null,
        merchant: null,
        pending: false,
        externalId: String(t.txnId || ""),
        metadata: { aaData: t },
      })
    );

    return { accounts: [], transactions, syncedAt: new Date(), hasMore: false };
  }

  async removeConnection(accessToken: string): Promise<void> {
    await fetch(`${this.config.apiBaseUrl}/sessions/${accessToken}`, {
      method: "DELETE",
      headers: {
        "x-client-id": this.config.clientId,
        "x-client-secret": this.config.clientSecret,
      },
    });
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Resolve the best bank connector for a given region.
 */
export function resolveBankConnector(
  region: DataRegion,
  connectors: {
    plaid?: PlaidBankConnector;
    accountAggregator?: AccountAggregatorConnector;
  }
): BankConnector | null {
  switch (region) {
    case "us-east":
    case "eu-west":
      return connectors.plaid ?? null;
    case "ap-south":
      return connectors.accountAggregator ?? connectors.plaid ?? null;
    default:
      return connectors.plaid ?? null;
  }
}
