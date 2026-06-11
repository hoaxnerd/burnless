"use client";

/**
 * Endpoint card (mockup expose-ui.html §1 .card): title + MCP chip + Live
 * pill, dark endpoint row with Copy, SET UP IN snippet pills. The
 * kill-switch row + warning state are appended by Task 13.
 */
import { useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast";
import { ToolSwitch } from "./tool-switch";

const SETUP_TARGETS = [
  { key: "claude-desktop", label: "Claude Desktop" },
  { key: "claude-code", label: "Claude Code" },
  { key: "cursor", label: "Cursor" },
  { key: "chatgpt", label: "ChatGPT" },
  { key: "cli", label: "burnless CLI" },
] as const;

type SetupKey = (typeof SETUP_TARGETS)[number]["key"];

function snippetFor(key: SetupKey, endpoint: string): string {
  switch (key) {
    case "claude-desktop":
      return `Settings → Connectors → Add custom connector\nURL: ${endpoint}\nAuth: paste a personal access token`;
    case "claude-code":
      return `claude mcp add burnless ${endpoint} \\\n  --header "Authorization: Bearer <your bl_pat_… token>"`;
    case "cursor":
      return `{\n  "mcpServers": {\n    "burnless": {\n      "url": "${endpoint}",\n      "headers": { "Authorization": "Bearer <your bl_pat_… token>" }\n    }\n  }\n}`;
    case "chatgpt":
      return `Settings → Connectors → Add MCP server\nURL: ${endpoint} (OAuth sign-in supported)`;
    case "cli":
      return `burnless login --url ${endpoint.replace(/\/mcp$/, "")} --with-token`;
  }
}

export function EndpointCard({
  mcpEndpoint,
  serverEnabled,
  canToggle,
  onToggle,
  children,
}: {
  mcpEndpoint: string;
  serverEnabled: boolean;
  /** owner/admin only (B8). */
  canToggle: boolean;
  onToggle: (enabled: boolean) => void;
  children?: ReactNode;
}) {
  const { success } = useToast();
  const [openSnippet, setOpenSnippet] = useState<SetupKey | null>(null);

  let reachable = false;
  try {
    const u = new URL(mcpEndpoint);
    reachable =
      u.protocol === "https:" ||
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1";
  } catch {
    reachable = false;
  }

  return (
    <div className="mb-3.5 rounded-xl border border-surface-200 bg-surface-0 px-[18px] py-[15px]">
      <div className="flex items-center gap-[9px]">
        <h3 className="text-[14.5px] font-semibold tracking-[-0.01em] text-surface-900">
          Burnless MCP server
        </h3>
        <span className="rounded-full bg-accent-100 px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.05em] text-accent-700">
          MCP
        </span>
        {!serverEnabled ? (
          <span className="rounded-full bg-surface-100 px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.05em] text-surface-500">
            Disabled
          </span>
        ) : reachable ? (
          <span className="inline-flex items-center gap-[5px] rounded-full bg-success-50 px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.05em] text-success-700 before:h-1.5 before:w-1.5 before:rounded-full before:bg-success-500 before:content-['']">
            Live
          </span>
        ) : (
          <span className="rounded-full bg-warning-50 px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.05em] text-warning-700">
            Unreachable
          </span>
        )}
      </div>
      <p className="mt-[3px] text-xs text-surface-500">
        Any MCP-capable agent can operate this company&apos;s financial model — scoped by token,
        every action audited.
      </p>
      {!reachable && (
        <div className="mt-2.5 flex items-start gap-[7px] rounded-md border border-warning-100 bg-warning-50 px-3 py-[9px] text-[11.5px] text-warning-700">
          <span>⚠</span>
          <span>
            Strict MCP clients (Claude Desktop, claude.ai) require HTTPS or localhost.
            This instance&apos;s URL is neither — set NEXT_PUBLIC_APP_URL to an https://
            address or use localhost.
          </span>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2.5 rounded-md bg-surface-900 px-3.5 py-[11px]">
        <span className="font-mono text-[12.5px] text-[#d7dce6]">{mcpEndpoint}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(mcpEndpoint);
            success("Endpoint copied");
          }}
          className="rounded-[7px] border border-surface-700 px-2.5 py-1 text-[10.5px] font-semibold text-[#9aa6bd]"
        >
          Copy
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-surface-400">SET UP IN</span>
        {SETUP_TARGETS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-expanded={openSnippet === t.key}
            onClick={() => setOpenSnippet(openSnippet === t.key ? null : t.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
              openSnippet === t.key
                ? "border-brand-500 text-brand-700"
                : "border-surface-300 bg-surface-50 text-surface-600 hover:border-brand-500 hover:text-brand-700"
            } ${t.key === "cli" ? "font-mono" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {openSnippet && (
        <div className="mt-2.5 rounded-md bg-surface-900 px-[13px] py-[11px]">
          <div className="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#5c6b87]">
            {SETUP_TARGETS.find((t) => t.key === openSnippet)!.label}
          </div>
          <code className="block whitespace-pre font-mono text-[10.5px] leading-[1.7] text-[#d7dce6]">
            {snippetFor(openSnippet, mcpEndpoint)}
          </code>
        </div>
      )}

      <div className="mt-3.5 flex items-center justify-between border-t border-surface-100 pt-[13px]">
        <div>
          <div className="text-[12.5px] font-semibold text-surface-900">External agent access</div>
          <div className="mt-px text-[11.5px] text-surface-500">
            {canToggle
              ? "Off = every inbound call returns 403, tokens stay intact."
              : "Only owners and admins can change this."}
          </div>
        </div>
        <div className={canToggle ? "" : "pointer-events-none opacity-50"}>
          <ToolSwitch
            checked={serverEnabled}
            label="External agent access"
            onToggle={() => canToggle && onToggle(!serverEnabled)}
          />
        </div>
      </div>

      {children}
    </div>
  );
}
