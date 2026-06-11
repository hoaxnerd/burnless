"use client";

/**
 * New-token modal, two states (mockup expose-ui.html §2):
 * configure → name + scope option-cards (role-uncovered scopes disabled) +
 * expiry select; created → green shown-once box (token in mono on
 * surface-900 + Copy), hash warning, Claude Code + CLI snippets.
 */
import { useState } from "react";
import { Modal, Button, Input, Select } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-fetch";
import { PermClassTag } from "./perm-class-tag";

type Scope = "read" | "write" | "delete";

const SCOPE_CARDS: Array<{ scope: Scope; title: string; description: string }> = [
  { scope: "read", title: "Read", description: "Metrics, statements, scenarios, projections" },
  { scope: "write", title: "Write", description: "Create & update forecasts, hires, rounds, scenarios" },
  { scope: "delete", title: "Delete", description: "Remove entities — grant only if the agent truly needs it" },
];

const EXPIRY_OPTIONS = [
  { value: "30", label: "In 30 days" },
  { value: "60", label: "In 60 days" },
  { value: "90", label: "In 90 days" },
  { value: "never", label: "Never" },
];

function roleCap(role: string): Scope[] {
  if (role === "viewer") return ["read"];
  if (role === "editor" || role === "admin" || role === "owner") return ["read", "write", "delete"];
  return [];
}

interface MintedToken {
  token: string;
  name: string;
  scopes: Scope[];
  expiresAt: string | null;
}

export function NewTokenModal({
  open,
  onClose,
  onMinted,
  userRole,
}: {
  open: boolean;
  onClose: () => void;
  onMinted: () => void;
  userRole: string;
}) {
  const { success } = useToast();
  const cap = roleCap(userRole);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Set<Scope>>(new Set(cap.includes("read") ? ["read"] : []));
  const [expiry, setExpiry] = useState("60");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<MintedToken | null>(null);

  function reset() {
    setName("");
    setScopes(new Set(cap.includes("read") ? ["read"] : []));
    setExpiry("60");
    setError(null);
    setMinted(null);
  }

  function toggle(scope: Scope) {
    if (!cap.includes(scope)) return;
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  async function mint() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          scopes: [...scopes],
          expiresInDays: expiry === "never" ? null : Number(expiry),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not create the token");
        return;
      }
      setMinted({ token: body.token, name: body.name, scopes: body.scopes, expiresAt: body.expiresAt });
      onMinted();
    } catch {
      setError("Network error — please retry");
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    reset();
    onClose();
  }

  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/mcp` : "/mcp";

  return (
    <Modal open={open} onClose={close} title={minted ? "Token created" : "New access token"} size="md">
      {minted ? (
        <div className="p-5">
          <div className="mb-3 rounded-lg border border-success-100 bg-success-50 px-3.5 py-[13px]">
            <div className="flex items-center gap-1.5 text-xs font-bold text-success-700">
              ✓ Copy it now — shown only once
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-surface-900 px-3 py-2.5">
              <span className="break-all font-mono text-[11px] text-[#d7dce6]">{minted.token}</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(minted.token);
                  success("Token copied");
                }}
                className="rounded-[7px] border border-surface-700 px-2.5 py-1 text-[10.5px] font-semibold text-[#9aa6bd]"
              >
                Copy
              </button>
            </div>
          </div>
          <div className="flex items-start gap-[7px] rounded-md border border-warning-100 bg-warning-50 px-3 py-[9px] text-[11.5px] text-warning-700">
            <span>⚠</span>
            <span>We store only a hash. If you lose it, revoke and mint a new one.</span>
          </div>
          <div className="mt-2.5 rounded-md bg-surface-900 px-[13px] py-[11px]">
            <div className="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#5c6b87]">
              Claude Code
            </div>
            <code className="block whitespace-pre font-mono text-[10.5px] leading-[1.7] text-[#d7dce6]">
              {`claude mcp add burnless ${endpoint} \\\n  --header "Authorization: Bearer ${minted.token.slice(0, 12)}…"`}
            </code>
          </div>
          <div className="mt-2.5 rounded-md bg-surface-900 px-[13px] py-[11px]">
            <div className="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#5c6b87]">
              burnless CLI
            </div>
            <code className="block whitespace-pre font-mono text-[10.5px] leading-[1.7] text-[#d7dce6]">
              burnless login --with-token
            </code>
          </div>
          <div className="mt-4 flex justify-end">
            <Button size="sm" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-5">
          <Input
            label="Token name"
            placeholder="e.g. Claude Desktop"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <div className="mt-3.5">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.05em] text-surface-500">
              Scopes
            </span>
            {SCOPE_CARDS.map(({ scope, title, description }) => {
              const allowed = cap.includes(scope);
              const checked = scopes.has(scope);
              return (
                <button
                  key={scope}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={`${title} scope`}
                  disabled={!allowed}
                  onClick={() => toggle(scope)}
                  className={`mb-2 flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left ${
                    checked ? "border-brand-500 bg-brand-50" : "border-surface-200"
                  } ${allowed ? "" : "cursor-not-allowed opacity-50"}`}
                >
                  <span
                    className={`mt-px h-4 w-4 flex-none rounded-[5px] border-[1.5px] ${
                      checked
                        ? "relative border-brand-600 bg-brand-600 after:absolute after:left-[4.5px] after:top-[1.5px] after:h-2 after:w-1 after:rotate-45 after:border-b-2 after:border-r-2 after:border-white after:content-['']"
                        : "border-surface-300"
                    }`}
                  />
                  <span>
                    <span className="flex items-center gap-[7px] text-[12.5px] font-semibold text-surface-900">
                      {title} <PermClassTag cls={scope} />
                    </span>
                    <span className="mt-px block text-[11px] text-surface-500">
                      {allowed ? description : `Your role (${userRole}) cannot mint this scope`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <Select label="Expires" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          {error && (
            <p className="mt-2 text-[11.5px] font-medium text-danger-600" role="alert">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2 border-t border-surface-100 pt-3.5">
            <Button variant="secondary" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={submitting || name.trim().length === 0 || scopes.size === 0}
              onClick={() => void mint()}
            >
              Create token
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
