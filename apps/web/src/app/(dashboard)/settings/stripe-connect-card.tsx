"use client";

import { useState } from "react";
import { Check, Unplug, Loader2 } from "lucide-react";
import { Input, Button } from "@/components/ui";
import { apiFetch } from "@/lib/api-fetch";
import { useLocale } from "@/components/locale/locale-context";
import { integrationRegistry, registerConnectors } from "@/lib/integrations/registry";

// ── Stripe connect card (C1.6) ──────────────────────────────────────────────
// Paste a restricted key → POST /api/integrations/stripe/connect. The scope
// checklist text comes straight from the connector's credentialSpec help (no
// hardcoded copy — single source of truth). The key is a PASSWORD input and is
// NEVER rendered back. When connected we show status + last-sync + Disconnect.

registerConnectors();
const stripe = integrationRegistry.get("stripe");
const credentialField = stripe?.credentialSpec.fields[0];

/** Turn the connector's free-text help into a checklist of scopes.
 *  Help shape: "…with Read on: A, B, C, …." — split on the colon then commas. */
function scopesFromHelp(help: string | undefined): string[] {
  if (!help) return [];
  const afterColon = help.includes(":") ? help.slice(help.indexOf(":") + 1) : help;
  return afterColon
    .replace(/\.$/, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface StripeConnectCardProps {
  /** Called after a successful connect so the parent can revalidate its list. */
  onConnected: () => void;
  /** Present when Stripe is already connected (drives the connected view). */
  connected?: { id: string; lastSyncAt: string | null } | null;
  /** Called with the integration id when the user clicks Disconnect. */
  onDisconnect?: (id: string) => void;
}

export function StripeConnectCard({ onConnected, connected, onDisconnect }: StripeConnectCardProps) {
  const { fmtDate } = useLocale();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const scopes = scopesFromHelp(credentialField?.help);
  const keyLabel = credentialField?.label ?? "Restricted API key";

  async function connect() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/integrations/stripe/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't connect to Stripe.");
        return;
      }
      setApiKey("");
      onConnected();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Connected view ────────────────────────────────────────────────────────
  if (connected) {
    return (
      <div className="rounded-2xl bg-success-50/30 border border-success-200 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-medium text-success-700">
            <Check className="h-3 w-3" />
            Connected
          </span>
          {connected.lastSyncAt && (
            <span className="text-xs text-surface-500">
              Last synced {fmtDate(connected.lastSyncAt)}
            </span>
          )}
        </div>
        <Button
          variant="danger"
          size="sm"
          icon={<Unplug className="h-3.5 w-3.5" />}
          onClick={() => onDisconnect?.(connected.id)}
        >
          Disconnect
        </Button>
      </div>
    );
  }

  // ── Connect view ──────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 p-5 space-y-4">
      {scopes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-surface-700 mb-2">
            Create a read-only restricted key with read access to:
          </p>
          <ul className="space-y-1">
            {scopes.map((scope) => (
              <li key={scope} className="flex items-center gap-2 text-xs text-surface-600">
                <Check className="h-3.5 w-3.5 text-success-600 shrink-0" />
                {scope}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Input
        type="password"
        label={keyLabel}
        autoComplete="off"
        placeholder="rk_live_…"
        value={apiKey}
        onChange={(e) => {
          setApiKey(e.target.value);
          if (error) setError(null);
        }}
        error={error ?? undefined}
      />

      <Button
        variant="primary"
        size="sm"
        disabled={submitting || apiKey.trim().length === 0}
        icon={submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined}
        onClick={connect}
      >
        {submitting ? "Connecting…" : "Connect"}
      </Button>
    </div>
  );
}
