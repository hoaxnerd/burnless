"use client";

import { useMemo, useRef, useState } from "react";
import { ExternalLink, KeyRound, Lock, Plus } from "lucide-react";
import { Button, Input, Modal, Select, Textarea } from "@/components/ui";
import { apiFetch } from "@/lib/api-fetch";
import { toUserMessage } from "@/lib/api-error";
import { useCapabilities } from "@/components/providers/capability-context";
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

/** Curated quick-connect catalog (Browse popular tab) — prefills the paste tab.
 *
 *  Every remote endpoint below was PROBE-VERIFIED (POST initialize → 401/JSON-RPC,
 *  i.e. live Streamable HTTP behind auth) on 2026-06-11. Auth labels:
 *  - "oauth": server advertises the OAuth discovery flow — our Authorize step handles it.
 *  - "token": server takes a pre-issued bearer/API token (PAT path).
 *  - "local": stdio entry (command set) — runs locally, self-host only; the
 *    server rejects it in cloud (deploy gate) and the inline error explains why.
 *  Notable exclusions (no official/runnable MCP as of 2026-06-11): QuickBooks
 *  (repo-only, not npx-runnable), FreshBooks (community-only), Gusto (none).
 */
interface PopularEntry {
  name: string;
  slug: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  auth: "oauth" | "token" | "local";
  note?: string;
}

const POPULAR_SECTIONS: Array<{ category: string; entries: PopularEntry[] }> = [
  {
    category: "Payments",
    entries: [
      { name: "Stripe", slug: "stripe", url: "https://mcp.stripe.com", auth: "oauth" },
      { name: "PayPal", slug: "paypal", url: "https://mcp.paypal.com/mcp", auth: "oauth" },
    ],
  },
  {
    category: "Banking & accounting",
    entries: [
      { name: "Mercury", slug: "mercury", url: "https://mcp.mercury.com/mcp", auth: "oauth" },
      { name: "Plaid", slug: "plaid", url: "https://api.dashboard.plaid.com/mcp/sse", auth: "token", note: "Dashboard token" },
      {
        name: "Xero",
        slug: "xero",
        command: "npx",
        args: ["-y", "@xeroapi/xero-mcp-server@latest"],
        env: { XERO_CLIENT_ID: "your-client-id", XERO_CLIENT_SECRET: "your-client-secret" },
        auth: "local",
        note: "Runs locally",
      },
    ],
  },
  {
    category: "Communication & support",
    entries: [
      { name: "Slack", slug: "slack", url: "https://mcp.slack.com/mcp", auth: "oauth" },
      { name: "Intercom", slug: "intercom", url: "https://mcp.intercom.com/mcp", auth: "oauth" },
    ],
  },
  {
    category: "Notes & docs",
    entries: [
      { name: "Notion", slug: "notion", url: "https://mcp.notion.com/mcp", auth: "oauth" },
      { name: "Canva", slug: "canva", url: "https://mcp.canva.com/mcp", auth: "oauth" },
    ],
  },
  {
    category: "Project management",
    entries: [
      { name: "Linear", slug: "linear", url: "https://mcp.linear.app/mcp", auth: "oauth" },
      { name: "Atlassian (Jira & Confluence)", slug: "atlassian", url: "https://mcp.atlassian.com/v1/mcp", auth: "oauth" },
    ],
  },
  {
    category: "Dev & monitoring",
    entries: [
      { name: "GitHub", slug: "github", url: "https://api.githubcopilot.com/mcp/", auth: "token", note: "Fine-grained PAT" },
      { name: "Sentry", slug: "sentry", url: "https://mcp.sentry.dev/mcp", auth: "oauth" },
    ],
  },
  {
    category: "CRM",
    entries: [
      { name: "HubSpot", slug: "hubspot", url: "https://mcp.hubspot.com/anthropic", auth: "oauth" },
    ],
  },
];

/** Build the paste-tab JSON a popular entry prefills. */
function popularEntryConfig(p: PopularEntry): string {
  const body = p.url
    ? { type: "http", url: p.url }
    : { type: "stdio", command: p.command, args: p.args, env: p.env };
  return JSON.stringify({ [p.slug]: body }, null, 2);
}

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
  const caps = useCapabilities();
  const [step, setStep] = useState<Step>("configure");
  const [tab, setTab] = useState<Tab>("paste");
  // Default "company" so when the toggle is hidden (!multiTenant) we submit
  // company scope, matching the server's coercion in resolveOwnerScope.
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
        setError(toUserMessage(data));
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
        setError(toUserMessage(data));
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
        setError(toUserMessage(data));
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
            <div className="max-h-[340px] space-y-3.5 overflow-y-auto pr-1" data-testid="popular-list">
              {POPULAR_SECTIONS.map((section) => (
                <div key={section.category}>
                  <BlockLabel className="sticky top-0 z-10 bg-surface-0 pb-1">
                    {section.category}
                  </BlockLabel>
                  <div className="grid grid-cols-2 gap-2.5">
                    {section.entries.map((p) => (
                      <button
                        key={p.slug}
                        type="button"
                        onClick={() => {
                          setConfig(popularEntryConfig(p));
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
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-semibold text-surface-900">
                            {p.name}
                          </span>
                          <span className="block truncate font-mono text-[10.5px] text-surface-500">
                            {p.url ? new URL(p.url).host : `${p.command} ${p.args?.join(" ") ?? ""}`}
                          </span>
                        </span>
                        <span
                          className={`flex-none rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                            p.auth === "oauth"
                              ? "bg-brand-50 text-brand-700"
                              : p.auth === "token"
                                ? "bg-warning-50 text-warning-700"
                                : "bg-surface-100 text-surface-500"
                          }`}
                          title={p.note}
                        >
                          {p.auth === "oauth" ? "OAuth" : p.auth === "token" ? "Token" : "Local"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <p role="alert" className="mt-2 text-xs font-medium text-danger-600">
              {error}
            </p>
          )}

          {/* Task 13: personal scope is meaningless single-user — hide the
              toggle when !multiTenant (self_host). The server coerces to
              company regardless (resolveOwnerScope), and the default `scope`
              state stays "company" so the hidden case submits company. */}
          {caps.multiTenant && (
            <>
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
