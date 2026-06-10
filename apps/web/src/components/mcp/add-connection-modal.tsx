"use client";

import { useMemo, useRef, useState } from "react";
import { ExternalLink, KeyRound, Lock, Plus } from "lucide-react";
import { Button, Input, Modal, Select, Textarea } from "@/components/ui";
import { apiFetch } from "@/lib/api-fetch";
import { glyphStyle } from "./provider-colors";

/**
 * AddConnectionModal — config-paste-first add flow (mockup: add-connection.html).
 *
 * Step 1 (Configure): Paste config (default) / Guided form / Browse popular
 * tabs + Company/Personal scope segmented control. Continue POSTs
 * `/api/mcp/connections`; the server parses, probes, and auth-detects (401 →
 * needs_auth). Step 2 (Authorize): full-page OAuth redirect via
 * `/authorize`, or the PAT fallback via `/credentials` (token never echoed
 * back). Step 3 (Tools & permissions) lives on the Manage panel — a
 * `connected` result closes the modal through `onCreated()`.
 */
export interface AddConnectionModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void; // grid revalidates KEYS.mcpConnections + closes
}

type Step = "configure" | "authorize";
type Tab = "paste" | "form" | "popular";

interface CreatedConnection {
  id: string;
  name?: string;
  slug: string;
  status: string;
  authType: string;
}

/** Curated quick-connect entries (Browse popular tab) — prefill the paste tab. */
const POPULAR: Array<{ name: string; slug: string; url: string }> = [
  { name: "Stripe", slug: "stripe", url: "https://mcp.stripe.com" },
  { name: "Linear", slug: "linear", url: "https://mcp.linear.app/mcp" },
  { name: "GitHub", slug: "github", url: "https://api.githubcopilot.com/mcp/" },
  { name: "Notion", slug: "notion", url: "https://mcp.notion.com/mcp" },
  { name: "Sentry", slug: "sentry", url: "https://mcp.sentry.dev/mcp" },
  { name: "Asana", slug: "asana", url: "https://mcp.asana.com/mcp" },
];

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "paste", label: "Paste config" },
  { id: "form", label: "Guided form" },
  { id: "popular", label: "Browse popular" },
];

const STEPS = ["Configure", "Authorize", "Tools & permissions"];

/** Best-effort client-side parse for the preview block (server re-parses). */
function tryParseConfig(
  json: string,
): { name: string; transport: string; endpoint: string } | null {
  if (!json.trim()) return null;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    if (typeof raw !== "object" || raw === null) return null;
    const map = (raw.mcpServers ?? raw) as Record<string, unknown>;
    const entries = Object.entries(map).filter(
      ([, v]) => typeof v === "object" && v !== null,
    );
    if (entries.length !== 1) return null;
    const [name, entry] = entries[0]!;
    const e = entry as { url?: unknown; command?: unknown };
    if (typeof e.url === "string") {
      let host: string;
      try {
        host = new URL(e.url).host;
      } catch {
        host = e.url; // unparseable — show the raw url
      }
      return { name, transport: "streamable-http", endpoint: host };
    }
    if (typeof e.command === "string") {
      return { name, transport: "stdio", endpoint: e.command };
    }
    return null;
  } catch {
    return null;
  }
}

/** Display treatment for server names/slugs ("stripe" → "Stripe") — shared
 *  with the grid's OAuth-return toast for parity. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** `.lbl` — 11px/600 uppercase label above a block (mockup). */
function BlockLabel({ children, className = "" }: { children: string; className?: string }) {
  return (
    <p
      className={`mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-surface-500 ${className}`.trim()}
    >
      {children}
    </p>
  );
}

export function AddConnectionModal({ open, onClose, onCreated }: AddConnectionModalProps) {
  const [step, setStep] = useState<Step>("configure");
  const [tab, setTab] = useState<Tab>("paste");
  const [scope, setScope] = useState<"company" | "personal">("company");
  const [config, setConfig] = useState("");
  const [formName, setFormName] = useState("");
  const [formTransport, setFormTransport] = useState<"streamable_http" | "stdio">(
    "streamable_http",
  );
  const [formEndpoint, setFormEndpoint] = useState("");
  const [created, setCreated] = useState<CreatedConnection | null>(null);
  const [tokenMode, setTokenMode] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Modal-session generation — bumped on every close. In-flight handlers
   *  capture the value at request start and bail if it changed by resolve
   *  time, so a late response can't advance steps / redirect on a closed
   *  modal. A boolean reset on reopen would let a request from a previous
   *  session slip through after close→reopen; the counter never resets. */
  const sessionRef = useRef(0);

  const parsed = useMemo(() => tryParseConfig(config), [config]);
  const serverName = created ? capitalize(created.name ?? created.slug) : "";

  function reset() {
    setStep("configure");
    setTab("paste");
    setScope("company");
    setConfig("");
    setFormName("");
    setFormTransport("streamable_http");
    setFormEndpoint("");
    setCreated(null);
    setTokenMode(false);
    setToken("");
    setBusy(false);
    setError(null);
  }

  /** Closing after a row was created still revalidates the grid (the
   *  connection exists in needs_auth) — route through onCreated. */
  function handleClose() {
    sessionRef.current += 1;
    if (created) onCreated();
    else onClose();
    reset();
  }

  const canContinue =
    tab === "paste"
      ? config.trim().length > 0
      : tab === "form"
        ? formName.trim().length > 0 && formEndpoint.trim().length > 0
        : false;

  async function handleContinue() {
    if (!canContinue || busy) return;
    const session = sessionRef.current;
    const stale = () => sessionRef.current !== session;
    setBusy(true);
    setError(null);
    const body =
      tab === "form"
        ? {
            name: formName.trim(),
            transport: formTransport,
            endpoint: formEndpoint.trim(),
            ownerScope: scope,
          }
        : { config, ownerScope: scope };
    try {
      const res = await apiFetch("/api/mcp/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<CreatedConnection> & {
        error?: string;
      };
      if (stale()) {
        // Closed mid-flight. A 2xx still created the row server-side — the
        // grid must revalidate; but never touch the (possibly reopened)
        // modal's state from a stale session.
        if (res.ok) onCreated();
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Failed to create the connection");
        return;
      }
      if (data.status === "needs_auth") {
        setCreated(data as CreatedConnection);
        setStep("authorize");
      } else {
        // connected (or error — the card surfaces it): hand back to the grid.
        onCreated();
        reset();
      }
    } catch {
      if (!stale()) setError("Network error — please try again.");
    } finally {
      if (!stale()) setBusy(false);
    }
  }

  async function handleAuthorize() {
    if (!created || busy) return;
    const session = sessionRef.current;
    const stale = () => sessionRef.current !== session;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/mcp/connections/${created.id}/authorize`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        authorizationUrl?: string;
        error?: string;
      };
      if (stale()) return; // closed mid-flight — never redirect a newer session
      if (!res.ok || !data.authorizationUrl) {
        setError(data.error ?? "Failed to start authorization");
        setBusy(false);
        return;
      }
      // Full-page redirect; the OAuth callback returns to /connections?connected=<slug>.
      // Deliberately KEEP busy=true — the button stays in its loading state
      // until the navigation unloads the page (no idle flicker mid-redirect).
      window.location.assign(data.authorizationUrl);
    } catch {
      if (!stale()) {
        setError("Network error — please try again.");
        setBusy(false);
      }
    }
  }

  async function handleSaveToken() {
    if (!created || !token.trim() || busy) return;
    const session = sessionRef.current;
    const stale = () => sessionRef.current !== session;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/mcp/connections/${created.id}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        error?: string;
      };
      if (stale()) {
        // Closed mid-flight. The token may have landed — revalidate the grid.
        if (res.ok) onCreated();
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Failed to save the token");
        return;
      }
      if (data.status === "connected") {
        onCreated();
        reset();
      } else {
        setError(
          "Token saved, but the server is still unreachable — check the token and try again.",
        );
      }
    } catch {
      if (!stale()) setError("Network error — please try again.");
    } finally {
      if (!stale()) setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add connection"
      size="lg"
      icon={
        <span
          aria-hidden
          className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] bg-gradient-to-br from-brand-500 to-accent-500 text-white"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
        </span>
      }
    >
      {/* Stepper strip — full-bleed under the header (mockup .steps) */}
      <div className="-mx-6 -mt-4 mb-3.5 flex items-center gap-1.5 border-b border-surface-200 bg-surface-50 px-[18px] py-[11px] text-[11.5px] font-semibold">
        {STEPS.map((label, i) => {
          const active = step === "configure" ? i === 0 : i === 1;
          return (
            <span key={label} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="mx-0.5 font-normal text-surface-300">
                  →
                </span>
              )}
              <span
                aria-current={active ? "step" : undefined}
                className={`flex items-center gap-1.5 ${active ? "text-brand-700" : "text-surface-400"}`}
              >
                <span
                  className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] ${
                    active ? "bg-brand-600 text-white" : "bg-surface-200 text-surface-500"
                  }`}
                >
                  {i + 1}
                </span>
                {label}
              </span>
            </span>
          );
        })}
      </div>

      {step === "configure" && (
        <>
          {/* Tab row (mockup .tabs). Plain toggle buttons + aria-pressed — NOT
              role=tablist: the full ARIA tabs pattern requires roving tabindex,
              arrow-key nav and aria-controls/tabpanel ids; partial semantics
              set wrong SR expectations (SegmentedControl shows the full
              pattern if this ever needs to graduate). */}
          <div className="mb-3.5 flex gap-1 rounded-lg bg-surface-100 p-[3px]">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => {
                  setTab(t.id);
                  setError(null);
                }}
                className={`flex-1 rounded-md py-[7px] text-center text-[12.5px] font-semibold transition-colors ${
                  tab === t.id
                    ? "bg-surface-0 text-surface-900 shadow-sm"
                    : "text-surface-500 hover:text-surface-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "paste" && (
            <>
              <BlockLabel>MCP server config (JSON)</BlockLabel>
              <Textarea
                variant="code"
                value={config}
                onChange={(e) => setConfig(e.target.value)}
                placeholder={`Paste the server's JSON config — same shape as Claude Code / openclaw`}
                aria-label="MCP server config (JSON)"
                spellCheck={false}
                className="min-h-[120px]"
              />

              {parsed && (
                <div className="mt-3.5 overflow-hidden rounded-xl border border-surface-200">
                  <div className="flex items-center gap-2 border-b border-surface-200 bg-success-50 px-3 py-2.5 text-xs font-semibold text-success-700">
                    ✓ Parsed — {capitalize(parsed.name)}
                  </div>
                  <div className="flex items-center gap-2.5 px-3 py-[9px] text-[12.5px]">
                    <span className="w-[92px] flex-none text-surface-500">Name</span>
                    <span className="font-semibold text-surface-900">
                      {capitalize(parsed.name)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 border-t border-surface-100 px-3 py-[9px] text-[12.5px]">
                    <span className="w-[92px] flex-none text-surface-500">Transport</span>
                    <span className="rounded-[5px] bg-brand-50 px-[7px] py-[2px] font-mono text-[10.5px] font-semibold text-brand-700">
                      {parsed.transport}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 border-t border-surface-100 px-3 py-[9px] text-[12.5px]">
                    <span className="w-[92px] flex-none text-surface-500">Endpoint</span>
                    <span className="truncate font-mono text-[11.5px] font-semibold text-surface-900 tabular-nums">
                      {parsed.endpoint}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "form" && (
            <div className="space-y-3.5">
              <Input
                label="Name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Stripe"
              />
              <Select
                label="Transport"
                value={formTransport}
                onChange={(e) =>
                  setFormTransport(e.target.value as "streamable_http" | "stdio")
                }
              >
                <option value="streamable_http">Remote (Streamable HTTP)</option>
                <option value="stdio">Local (stdio)</option>
              </Select>
              <Input
                label={formTransport === "stdio" ? "Command" : "Server URL"}
                value={formEndpoint}
                onChange={(e) => setFormEndpoint(e.target.value)}
                placeholder={
                  formTransport === "stdio" ? "npx some-mcp-server" : "https://mcp.example.com"
                }
              />
            </div>
          )}

          {tab === "popular" && (
            <div className="grid grid-cols-2 gap-2.5">
              {POPULAR.map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => {
                    setConfig(
                      JSON.stringify(
                        { [p.slug]: { type: "http", url: p.url } },
                        null,
                        2,
                      ),
                    );
                    setError(null);
                    setTab("paste");
                  }}
                  className="flex items-center gap-2.5 rounded-lg border border-surface-200 bg-surface-0 p-2.5 text-left transition-colors hover:border-brand-300 hover:shadow-sm"
                >
                  <span
                    aria-hidden
                    className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-xs font-bold text-white"
                    style={glyphStyle(p.slug)}
                  >
                    {p.name.charAt(0)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-semibold text-surface-900">
                      {p.name}
                    </span>
                    <span className="block truncate font-mono text-[10.5px] text-surface-500">
                      {new URL(p.url).host}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {error && (
            <p role="alert" className="mt-2 text-xs font-medium text-danger-600">
              {error}
            </p>
          )}

          <BlockLabel className="mt-4">Who can use this connection?</BlockLabel>
          <div className="flex gap-2">
            <button
              type="button"
              aria-pressed={scope === "company"}
              onClick={() => setScope("company")}
              className={`flex flex-1 flex-col gap-0.5 rounded-lg border-[1.5px] px-[11px] py-[9px] text-left transition-colors ${
                scope === "company"
                  ? "border-brand-500 bg-brand-50"
                  : "border-surface-200 hover:border-surface-300"
              }`}
            >
              <b className="text-[12.5px] font-bold text-surface-900">Company</b>
              <small className="text-[10.5px] text-surface-500">
                Shared with all members
              </small>
            </button>
            <button
              type="button"
              aria-pressed={scope === "personal"}
              onClick={() => setScope("personal")}
              className={`flex flex-1 flex-col gap-0.5 rounded-lg border-[1.5px] px-[11px] py-[9px] text-left transition-colors ${
                scope === "personal"
                  ? "border-accent-500 bg-accent-50"
                  : "border-surface-200 hover:border-surface-300"
              }`}
            >
              <b className="text-[12.5px] font-bold text-surface-900">Personal</b>
              <small className="text-[10.5px] text-surface-500">Only you</small>
            </button>
          </div>
        </>
      )}

      {step === "authorize" && created && (
        <div className="rounded-xl border border-surface-200 bg-surface-50 p-[13px]">
          <div className="mb-2.5 flex items-center gap-[9px]">
            <span
              aria-hidden
              className="flex h-6 w-6 flex-none items-center justify-center rounded-[7px] bg-warning-500 text-white"
            >
              <KeyRound className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <b className="block text-[13px] font-bold text-surface-900">
                This server uses OAuth
              </b>
              <small className="block text-[11px] text-surface-500">
                You&apos;ll sign in at {serverName}; redirect returns to this workspace.
              </small>
            </div>
          </div>

          {!tokenMode ? (
            <>
              <Button
                fullWidth
                size="sm"
                icon={<ExternalLink className="h-[15px] w-[15px]" />}
                state={busy ? "loading" : "idle"}
                onClick={() => void handleAuthorize()}
                className="!py-[11px] !text-[13px]"
              >
                Connect &amp; authorize with {serverName}
              </Button>
              <p className="mt-[9px] text-center text-[11.5px] text-surface-500">
                or{" "}
                <button
                  type="button"
                  onClick={() => {
                    setTokenMode(true);
                    setError(null);
                  }}
                  className="font-semibold text-brand-600 underline hover:text-brand-700"
                >
                  use an access token / PAT instead
                </button>
              </p>
            </>
          ) : (
            <div className="flex flex-col gap-2.5">
              <Input
                label="Access token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste the token from the provider's settings"
                autoComplete="off"
              />
              <Button
                fullWidth
                size="sm"
                state={busy ? "loading" : "idle"}
                disabled={!token.trim()}
                onClick={() => void handleSaveToken()}
                className="!py-[11px] !text-[13px]"
              >
                Save token
              </Button>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-2 text-xs font-medium text-danger-600">
              {error}
            </p>
          )}

          <div className="mt-[11px] flex items-center gap-[7px] rounded-md border border-success-100 bg-success-50 px-[9px] py-[7px] text-[11px] text-success-700">
            <Lock className="h-[13px] w-[13px] flex-none text-success-600" strokeWidth={2} />
            Tokens are encrypted at rest (AES-256-GCM) — never shown again after saving.
          </div>
        </div>
      )}

      {/* Footer — full-bleed (mockup .mft) */}
      <div className="-mx-6 -mb-4 mt-[17px] flex items-center gap-[9px] border-t border-surface-200 bg-surface-50 px-[18px] py-[13px]">
        <Button variant="secondary" size="sm" onClick={handleClose}>
          Cancel
        </Button>
        <span className="flex-1" />
        {step === "configure" && (
          <Button
            size="sm"
            state={busy ? "loading" : "idle"}
            disabled={!canContinue}
            onClick={() => void handleContinue()}
          >
            Continue <span aria-hidden="true">→</span>
          </Button>
        )}
      </div>
    </Modal>
  );
}
