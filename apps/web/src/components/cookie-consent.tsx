"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type CookiePreferences = {
  essential: true; // always true, cannot be disabled
  analytics: boolean;
  marketing: boolean;
};

const CONSENT_KEY = "burnless-cookie-consent";
const CONSENT_VERSION = "1"; // bump when cookie categories change

type CookieInfo = {
  name: string;
  purpose: string;
  duration: string;
};

const COOKIE_INVENTORY: Record<"essential" | "analytics" | "marketing", { description: string; cookies: CookieInfo[] }> = {
  essential: {
    description: "Required for the site to function. Cannot be disabled.",
    cookies: [
      { name: "next-auth.session-token", purpose: "Maintains your authenticated session", duration: "30 days" },
      { name: "next-auth.csrf-token", purpose: "Protects against cross-site request forgery", duration: "Session" },
      { name: "next-auth.callback-url", purpose: "Stores redirect URL after authentication", duration: "Session" },
      { name: "burnless-cookie-consent", purpose: "Remembers your cookie preferences", duration: "1 year" },
    ],
  },
  analytics: {
    description: "Help us understand how you use Burnless to improve the product.",
    cookies: [
      { name: "_ga", purpose: "Distinguishes unique users for Google Analytics", duration: "2 years" },
      { name: "_ga_*", purpose: "Maintains session state for Google Analytics", duration: "2 years" },
    ],
  },
  marketing: {
    description: "Deliver relevant content and measure campaign effectiveness.",
    cookies: [
      { name: "_fbp", purpose: "Identifies browsers for Facebook ad delivery", duration: "3 months" },
      { name: "_gcl_au", purpose: "Stores ad click info for Google Ads conversion tracking", duration: "3 months" },
    ],
  },
};

const REOPEN_EVENT = "burnless-cookie-settings-open";

function getStoredConsent(): CookiePreferences | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed.preferences;
  } catch {
    return null;
  }
}

function storeConsent(preferences: CookiePreferences) {
  localStorage.setItem(
    CONSENT_KEY,
    JSON.stringify({ version: CONSENT_VERSION, preferences, timestamp: Date.now() })
  );
}

/** Dispatch a custom event so analytics providers can listen for consent changes */
function dispatchConsentEvent(preferences: CookiePreferences) {
  window.dispatchEvent(
    new CustomEvent("burnless-consent-update", { detail: preferences })
  );
}

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(() => {
    if (typeof window === "undefined") return { essential: true, analytics: false, marketing: false };
    return getStoredConsent() ?? { essential: true, analytics: false, marketing: false };
  });

  useEffect(() => {
    const stored = getStoredConsent();
    if (stored) {
      dispatchConsentEvent(stored);
    } else {
      // Delay banner to avoid competing with hero LCP element
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Listen for re-open requests (e.g. from footer "Cookie Settings" link)
  useEffect(() => {
    const handleReopen = () => {
      const stored = getStoredConsent();
      if (stored) setPreferences(stored);
      setShowDetails(true);
      setVisible(true);
    };
    window.addEventListener(REOPEN_EVENT, handleReopen);
    return () => window.removeEventListener(REOPEN_EVENT, handleReopen);
  }, []);

  const acceptAll = useCallback(() => {
    const all: CookiePreferences = { essential: true, analytics: true, marketing: true };
    storeConsent(all);
    dispatchConsentEvent(all);
    setVisible(false);
  }, []);

  const rejectNonEssential = useCallback(() => {
    const minimal: CookiePreferences = { essential: true, analytics: false, marketing: false };
    storeConsent(minimal);
    dispatchConsentEvent(minimal);
    setVisible(false);
  }, []);

  const savePreferences = useCallback(() => {
    storeConsent(preferences);
    dispatchConsentEvent(preferences);
    setVisible(false);
  }, [preferences]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 inset-x-0 z-50 p-4 sm:p-6"
    >
      <div className="mx-auto max-w-2xl rounded-xl border border-surface-200/30 bg-surface-0/95 backdrop-blur-md shadow-lg dark:bg-surface-950/95 dark:border-surface-700/30">
        <div className="p-5 sm:p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-surface-900">
                Cookie Preferences
              </h2>
              <p className="mt-1 text-sm text-surface-500 leading-relaxed">
                We use cookies to improve your experience. Essential cookies are
                required for the site to function. You can choose which optional
                cookies to allow.{" "}
                <Link
                  href="/privacy#cookies"
                  className="text-brand-600 hover:text-brand-700 underline underline-offset-2 inline-block py-1"
                >
                  Learn more
                </Link>
              </p>
            </div>
          </div>

          {/* Granular controls (expandable) */}
          {showDetails && (
            <div className="mt-4 space-y-4 rounded-lg border border-surface-200/30 bg-surface-50/50 p-4 dark:bg-surface-900/50 dark:border-surface-700/20 max-h-[60vh] overflow-y-auto">
              {/* Essential */}
              <div>
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-surface-900">
                      Essential
                    </span>
                    <p className="text-xs text-surface-400">
                      {COOKIE_INVENTORY.essential.description}
                    </p>
                  </div>
                  <div className="relative flex-shrink-0">
                    <input
                      type="checkbox"
                      checked
                      disabled
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 rounded-full bg-brand-500 opacity-60 cursor-not-allowed" />
                    <div className="absolute top-0.5 left-[18px] w-4 h-4 rounded-full bg-white shadow-sm" />
                  </div>
                </label>
                <CookieTable cookies={COOKIE_INVENTORY.essential.cookies} />
              </div>

              {/* Analytics */}
              <div>
                <label className="flex items-center justify-between cursor-pointer group">
                  <div>
                    <span className="text-sm font-medium text-surface-900 group-hover:text-brand-600 transition-colors">
                      Analytics
                    </span>
                    <p className="text-xs text-surface-400">
                      {COOKIE_INVENTORY.analytics.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.analytics}
                    onClick={() =>
                      setPreferences((p) => ({ ...p, analytics: !p.analytics }))
                    }
                    className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                      preferences.analytics
                        ? "bg-brand-500"
                        : "bg-surface-300 dark:bg-surface-600"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                        preferences.analytics
                          ? "translate-x-[18px]"
                          : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </label>
                <CookieTable cookies={COOKIE_INVENTORY.analytics.cookies} />
              </div>

              {/* Marketing */}
              <div>
                <label className="flex items-center justify-between cursor-pointer group">
                  <div>
                    <span className="text-sm font-medium text-surface-900 group-hover:text-brand-600 transition-colors">
                      Marketing
                    </span>
                    <p className="text-xs text-surface-400">
                      {COOKIE_INVENTORY.marketing.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.marketing}
                    onClick={() =>
                      setPreferences((p) => ({ ...p, marketing: !p.marketing }))
                    }
                    className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                      preferences.marketing
                        ? "bg-brand-500"
                        : "bg-surface-300 dark:bg-surface-600"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                        preferences.marketing
                          ? "translate-x-[18px]"
                          : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </label>
                <CookieTable cookies={COOKIE_INVENTORY.marketing.cookies} />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-5 flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 sm:justify-between">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="text-sm text-surface-500 hover:text-surface-900 transition-colors underline underline-offset-2"
            >
              {showDetails ? "Hide details" : "Customize"}
            </button>

            <div className="flex flex-col sm:flex-row gap-2">
              {showDetails ? (
                <button
                  type="button"
                  onClick={savePreferences}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                >
                  Save preferences
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={rejectNonEssential}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-surface-200/50 text-surface-700 hover:bg-surface-100 transition-colors dark:border-surface-700/50 dark:text-surface-300 dark:hover:bg-surface-800"
                  >
                    Essential only
                  </button>
                  <button
                    type="button"
                    onClick={acceptAll}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                  >
                    Accept all
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CookieTable({ cookies }: { cookies: CookieInfo[] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-xs text-surface-500">
        <thead>
          <tr className="border-b border-surface-200/20 dark:border-surface-700/20">
            <th className="text-left font-medium text-surface-600 pb-1.5 pr-3">Cookie</th>
            <th className="text-left font-medium text-surface-600 pb-1.5 pr-3">Purpose</th>
            <th className="text-left font-medium text-surface-600 pb-1.5">Duration</th>
          </tr>
        </thead>
        <tbody>
          {cookies.map((c) => (
            <tr key={c.name} className="border-b border-surface-200/10 dark:border-surface-700/10 last:border-0">
              <td className="py-1.5 pr-3 font-mono text-surface-600 whitespace-nowrap">{c.name}</td>
              <td className="py-1.5 pr-3">{c.purpose}</td>
              <td className="py-1.5 whitespace-nowrap">{c.duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Hook for other components to check cookie consent status.
 * Returns null if consent hasn't been given yet.
 */
export function getCookieConsent(): CookiePreferences | null {
  if (typeof window === "undefined") return null;
  return getStoredConsent();
}

/** Client component button that re-opens the cookie consent banner */
export function CookieSettingsButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(REOPEN_EVENT))}
      className="text-sm text-surface-500 hover:text-surface-900 transition-colors inline-block py-3"
    >
      Cookie Settings
    </button>
  );
}
