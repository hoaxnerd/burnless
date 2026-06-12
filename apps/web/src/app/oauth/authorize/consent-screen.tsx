"use client";

/**
 * Consent screen body (mockup expose-ui.html §3). Scope toggles are
 * downgrade-only: requested scopes start checked and can be unchecked;
 * unrequested scopes are dimmed + disabled. Checkbox semantics via
 * role="checkbox" + aria-checked (A11Y-CTRL guard).
 */
import { useState } from "react";
import { Button, Select } from "@/components/ui";
import { PermClassTag } from "@/components/mcp/perm-class-tag";
import { toUserMessage } from "@/lib/api-error";

type Scope = "read" | "write" | "delete";

const SCOPE_COPY: Record<Scope, { title: string; description: string }> = {
  read: { title: "Read", description: "Metrics, statements, scenarios, projections" },
  write: { title: "Write", description: "Create & update forecasts, hires, rounds" },
  delete: { title: "Delete", description: "Remove entities" },
};

const ALL_SCOPES: Scope[] = ["read", "write", "delete"];

export function ConsentScreen({
  client,
  companies,
  requestedScopes,
  oauthParams,
}: {
  client: { id: string; name: string };
  companies: Array<{ companyId: string; name: string; role: string }>;
  requestedScopes: Scope[];
  oauthParams: { redirectUri: string; state: string | null; codeChallenge: string; resource: string };
}) {
  const [companyId, setCompanyId] = useState(companies[0]!.companyId);
  const [granted, setGranted] = useState<Set<Scope>>(new Set(requestedScopes));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCompany = companies.find((c) => c.companyId === companyId)!;

  function toggle(scope: Scope) {
    if (!requestedScopes.includes(scope)) return; // downgrade-only
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  async function submit(decision: "approve" | "deny") {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/oauth/authorize/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: client.id,
          redirect_uri: oauthParams.redirectUri,
          state: oauthParams.state,
          code_challenge: oauthParams.codeChallenge,
          resource: oauthParams.resource,
          scopes: decision === "approve" ? [...granted] : requestedScopes,
          company_id: companyId,
          decision,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(toUserMessage(body));
        setSubmitting(false);
        return;
      }
      window.location.assign(body.redirectTo);
    } catch {
      setError("Network error — please retry");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-100 p-7">
      <div className="w-full max-w-[420px] rounded-2xl border border-surface-200 bg-surface-0 p-7 shadow-xl">
        {/* handshake header (mockup .chandshake) */}
        <div className="mb-[18px] flex items-center justify-center gap-3.5">
          <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[14px] bg-surface-700 text-lg font-extrabold text-white">
            {client.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="flex gap-1">
            <i className="h-1 w-1 rounded-full bg-surface-300" />
            <i className="h-1 w-1 rounded-full bg-surface-300" />
            <i className="h-1 w-1 rounded-full bg-surface-300" />
          </span>
          <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[14px] bg-gradient-to-br from-brand-500 to-accent-500 text-lg font-extrabold text-white">
            b
          </span>
        </div>
        <h1 className="text-center text-[17px] font-bold tracking-[-0.015em] text-surface-900">
          {client.name} wants to access Burnless
        </h1>
        <p className="mt-1 mb-[18px] text-center text-[12.5px] text-surface-500">
          Requested by <b className="text-surface-700">{client.name}</b> · verify you started this connection
        </p>

        {/* company picker row (mockup .crow .companysel) */}
        <div className="mb-[9px] flex items-center justify-between rounded-lg border border-surface-200 px-[13px] py-[11px]">
          <div className="flex w-full items-center gap-[9px]">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 text-[11px] font-bold text-white">
              {selectedCompany.name.slice(0, 1).toUpperCase()}
            </span>
            {companies.length > 1 ? (
              <Select
                label="Company"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                wrapperClassName="w-full"
              >
                {companies.map((c) => (
                  <option key={c.companyId} value={c.companyId}>
                    {c.name} · your role: {c.role}
                  </option>
                ))}
              </Select>
            ) : (
              <div>
                <div className="text-[12.5px] font-semibold text-surface-900">{selectedCompany.name}</div>
                <div className="mt-px text-[11px] text-surface-500">Your role: {selectedCompany.role}</div>
              </div>
            )}
          </div>
        </div>

        {/* scope rows (mockup .crow) */}
        {ALL_SCOPES.map((scope) => {
          const requested = requestedScopes.includes(scope);
          const checked = granted.has(scope);
          return (
            <button
              key={scope}
              type="button"
              role="checkbox"
              aria-checked={checked}
              aria-label={`Grant ${scope} access`}
              disabled={!requested || submitting}
              onClick={() => toggle(scope)}
              className={`mb-[9px] flex w-full items-center justify-between rounded-lg border border-surface-200 px-[13px] py-[11px] text-left ${
                requested ? "" : "opacity-[0.65]"
              }`}
            >
              <div>
                <div className="flex items-center gap-[5px] text-[12.5px] font-semibold text-surface-900">
                  {SCOPE_COPY[scope].title} <PermClassTag cls={scope} />
                </div>
                <div className="mt-px text-[11px] text-surface-500">
                  {requested ? SCOPE_COPY[scope].description : "Not requested by this app"}
                </div>
              </div>
              <span
                className={`mt-px h-4 w-4 flex-none rounded-[5px] border-[1.5px] ${
                  checked
                    ? "relative border-brand-600 bg-brand-600 after:absolute after:left-[4.5px] after:top-[1.5px] after:h-2 after:w-1 after:rotate-45 after:border-b-2 after:border-r-2 after:border-white after:content-['']"
                    : "border-surface-300"
                }`}
              />
            </button>
          );
        })}

        {error && (
          <p className="mt-2 text-[11.5px] font-medium text-danger-600" role="alert">
            {error}
          </p>
        )}

        {/* footer (mockup .cfoot) */}
        <div className="mt-[18px] flex gap-2.5">
          <Button variant="secondary" fullWidth disabled={submitting} onClick={() => void submit("deny")}>
            Deny
          </Button>
          <Button
            fullWidth
            disabled={submitting || granted.size === 0}
            onClick={() => void submit("approve")}
          >
            Approve
          </Button>
        </div>
        <p className="mt-3.5 text-center text-[10.5px] leading-relaxed text-surface-400">
          Every action this app takes is audited and attributed to it.
          <br />
          Revoke anytime from Connections → Your MCP.
        </p>
      </div>
    </main>
  );
}
