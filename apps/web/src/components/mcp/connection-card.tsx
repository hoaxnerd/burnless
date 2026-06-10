import type { CSSProperties } from "react";
import type { McpConnectionDto } from "./types";
import { ScopeBadge } from "./scope-badge";
import { StatusPill } from "./status-pill";

/**
 * ConnectionCard — one MCP server in the Connections grid.
 *
 * Mockup: placement.html `.conn` — 1px surface-200 border, --radius-lg card,
 * 15px padding, shadow-sm; 38px/10px-radius brand glyph; meta row divided by a
 * surface-100 hairline (13px above / 12px below).
 */

/** Known provider brand colors — the only permitted color literals (pixel contract). */
const PROVIDER_COLORS: Record<string, string> = {
  stripe: "#635bff",
  linear: "#5e6ad2",
  github: "#24292f",
};

function glyphStyle(slug: string): CSSProperties {
  return { backgroundColor: PROVIDER_COLORS[slug] ?? "var(--color-highlight-500)" };
}

/** Card subtitle: endpoint host for HTTP servers, `stdio · <command>` for local. */
function subtitle(c: McpConnectionDto): string {
  if (c.transport === "stdio") return `stdio · ${c.endpoint}`;
  try {
    return new URL(c.endpoint).host;
  } catch {
    return c.endpoint;
  }
}

export function ConnectionCard({
  connection,
  onManage,
}: {
  connection: McpConnectionDto;
  onManage: (c: McpConnectionDto) => void;
}) {
  const toolCount = connection.capabilities?.tools.length ?? null;
  const needsAuth = connection.status === "needs_auth";
  return (
    <div className="rounded-lg border border-surface-200 bg-surface-0 p-[15px] shadow-sm">
      <div className="flex items-center gap-[11px]">
        <span
          className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] text-[15px] font-bold text-white"
          style={glyphStyle(connection.slug)}
          aria-hidden
        >
          {connection.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-[14.5px] font-semibold text-surface-900">
            {connection.name}
          </h3>
          <div className="mt-[1px] truncate font-mono text-[11.5px] tracking-[-0.01em] text-surface-500 tabular-nums">
            {subtitle(connection)}
          </div>
        </div>
        <ScopeBadge scope={connection.ownerScope} />
      </div>
      <div className="mt-[13px] flex items-center gap-2 border-t border-surface-100 pt-3">
        <StatusPill status={connection.status} authType={connection.authType} />
        <span className="ml-2.5 text-[11.5px] text-surface-600">
          <b className="font-bold text-surface-900 tabular-nums">{toolCount ?? "—"}</b> tools
        </span>
        <button
          type="button"
          onClick={() => onManage(connection)}
          className="ml-auto flex-none text-[11.5px] font-semibold text-brand-600 hover:text-brand-700"
        >
          {needsAuth ? "Authenticate →" : "Manage →"}
        </button>
      </div>
    </div>
  );
}
