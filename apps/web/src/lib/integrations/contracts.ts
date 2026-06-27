/** The normalized unit the ingestion pipeline consumes. Superset of the legacy engine
 *  MappedTransaction so it can carry the gross+fee split, currency, and category hint. */
export interface MappedRecord {
  externalId: string;              // "stripe:txn_…" / "stripe:txn_…:fee" — dedup key
  date: Date;                      // accrual date (balance_transaction.created)
  amount: number;                  // SIGNED, major units, settlement currency (Decimal at boundary)
  currency: string;                // settlement currency (lowercase ISO)
  description: string;
  vendor?: string | null;
  categoryHint?: "revenue" | "payment_processing_fees" | "refund" | "dispute";
  metadata?: Record<string, unknown>; // raw stripe ids, reporting_category, fee_details, exchange_rate
}

export interface CredentialField { key: string; label: string; secret?: boolean; help?: string; }
export type ValidateResult =
  | { ok: true; livemode: boolean; meta?: Record<string, unknown> }
  | { ok: false; error: string };
export interface CredentialSpec {
  fields: CredentialField[];
  validate(creds: Record<string, string>): Promise<ValidateResult>;
}

export interface StreamDef { id: string }
export interface SyncCtx { companyId: string; apiKey: string }
export type SyncCursor = { created: number } | null; // unix seconds high-water mark
export interface SourceContract {
  streams: StreamDef[];
  backfill(ctx: SyncCtx): AsyncIterable<MappedRecord>;
  incremental(ctx: SyncCtx, cursor: SyncCursor): AsyncIterable<MappedRecord>;
}

// Seams (typed, unimplemented this workstream) — see spec §1.1.
export interface ActionDef { id: string; description: string }

export interface IntegrationConnector {
  id: string;
  displayName: string;
  description: string;
  icon: string;                    // lucide name
  capability?: string;             // gate key, e.g. "integrations"
  credentialSpec: CredentialSpec;
  source?: SourceContract;         // INBOUND (Stripe implements)
  actions?: ActionDef[];           // OUTBOUND seam — undefined for Stripe
  dependsOn?: string[];            // inter-integration seam — undefined for Stripe
}

export interface CatalogEntry {
  type: string; displayName: string; description: string; icon: string;
  capability?: string; status: "available" | "coming_soon";
}
