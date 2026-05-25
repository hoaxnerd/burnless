import { isValidCurrency, type CurrencyCode } from "@burnless/types";

/**
 * Resolve the currency code to use for server-side formatting.
 *
 * Phase 0 §1.6 says: rows persisted before the whitelist landed may hold
 * arbitrary text in `companies.currency`. Always validate at the formatter
 * boundary so a bad row never crashes Intl.NumberFormat.
 *
 * Server Components cannot use `useLocale()`; this is their alternative.
 * Pattern: `formatCurrency(v, companyCurrency(company), undefined, ...)`.
 */
export function companyCurrency(company: { currency?: string | null } | null | undefined): CurrencyCode {
  const raw = company?.currency;
  if (typeof raw === "string" && isValidCurrency(raw)) {
    return raw;
  }
  return "USD";
}
