"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  type CurrencyCode,
  type DataRegion,
  type LocaleSettings,
  DEFAULT_LOCALE_SETTINGS,
  CURRENCIES,
  formatCurrency,
  formatCompactAmount,
  formatNumber,
  formatDate,
  formatMonthKey,
  formatPercent,
  getCurrencySymbol,
  isValidCurrency,
} from "@burnless/types";

interface LocaleContextValue extends LocaleSettings {
  loaded: boolean;
  /** Format a monetary amount (full form: "$1,234" / "₹1,23,456"). */
  fmtCurrency: (amount: number, options?: { compact?: boolean; decimals?: number }) => string;
  /** Format a monetary amount in compact notation ("$1.2M" / "₹10L"). */
  fmtCompact: (amount: number) => string;
  /** Format a plain number respecting locale. */
  fmtNumber: (value: number, options?: { decimals?: number; compact?: boolean }) => string;
  /** Format a date respecting locale. */
  fmtDate: (date: Date | string, options?: Intl.DateTimeFormatOptions) => string;
  /** Format a month key (YYYY-MM) to display string. */
  fmtMonth: (monthKey: string, options?: { includeYear?: boolean }) => string;
  /** Format a percentage. */
  fmtPercent: (value: number, decimals?: number) => string;
  /** Get the currency symbol. */
  currencySymbol: string;
}

const LocaleContext = createContext<LocaleContextValue>({
  ...DEFAULT_LOCALE_SETTINGS,
  loaded: false,
  fmtCurrency: (amount) => formatCurrency(amount),
  fmtCompact: (amount) => formatCompactAmount(amount),
  fmtNumber: (value) => formatNumber(value),
  fmtDate: (date) => formatDate(date),
  fmtMonth: (monthKey) => formatMonthKey(monthKey),
  fmtPercent: (value) => formatPercent(value),
  currencySymbol: "$",
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<LocaleSettings>(DEFAULT_LOCALE_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/company")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          const currency = isValidCurrency(data.currency) ? data.currency : "USD";
          setSettings({
            locale: data.locale || CURRENCIES[currency]?.defaultLocale || "en-US",
            currency,
            timezone: data.timezone || "America/New_York",
            region: data.region || "us-east",
          });
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const fmtCurrencyFn = useCallback(
    (amount: number, options?: { compact?: boolean; decimals?: number }) =>
      formatCurrency(amount, settings.currency, settings.locale, options),
    [settings.currency, settings.locale]
  );

  const fmtCompactFn = useCallback(
    (amount: number) => formatCompactAmount(amount, settings.currency, settings.locale),
    [settings.currency, settings.locale]
  );

  const fmtNumberFn = useCallback(
    (value: number, options?: { decimals?: number; compact?: boolean }) =>
      formatNumber(value, settings.locale, options),
    [settings.locale]
  );

  const fmtDateFn = useCallback(
    (date: Date | string, options?: Intl.DateTimeFormatOptions) =>
      formatDate(date, settings.locale, options),
    [settings.locale]
  );

  const fmtMonthFn = useCallback(
    (monthKey: string, options?: { includeYear?: boolean }) =>
      formatMonthKey(monthKey, settings.locale, options),
    [settings.locale]
  );

  const fmtPercentFn = useCallback(
    (value: number, decimals?: number) => formatPercent(value, settings.locale, decimals),
    [settings.locale]
  );

  const value: LocaleContextValue = {
    ...settings,
    loaded,
    fmtCurrency: fmtCurrencyFn,
    fmtCompact: fmtCompactFn,
    fmtNumber: fmtNumberFn,
    fmtDate: fmtDateFn,
    fmtMonth: fmtMonthFn,
    fmtPercent: fmtPercentFn,
    currencySymbol: getCurrencySymbol(settings.currency),
  };

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * Hook to access locale-aware formatting throughout the app.
 * All formatting functions automatically use the company's currency and locale.
 */
export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
