"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AsyncData, useQueryState } from "@/components/ui";
import { useMcpConnections, useMcpConnectionTools } from "@/lib/swr/hooks";
import { glyphStyle } from "@/components/mcp/provider-colors";
import { ScopeBadge } from "@/components/mcp/scope-badge";
import { StatusPill } from "@/components/mcp/status-pill";
import { PermClassTag } from "@/components/mcp/perm-class-tag";
import type { McpConnectionDto, McpToolDto } from "@/components/mcp/types";
import { CategorySection } from "./category-section";
import { EnableSwitch } from "./enable-switch";
import type { ToolsCtx } from "./tools-ctx";

/**
 * ConnectorsCategory (S3b §4, §12) — external MCP servers. One row per visible
 * connection: 22px brand glyph, name + "<n> tools[ · <m> on]", ScopeBadge, and
 * an EnableSwitch (connected) or StatusPill (non-connected). Connected rows
 * expand to their per-tool list (`useMcpConnectionTools`) — each tool is mono
 * name + PermClassTag + per-tool EnableSwitch.
 *
 * Session key scheme: connector `conn:<id>`, connector-tool
 * `conntool:<id>:<tool>`. The permanent layer for a connector is
 * `userPreferences.disabledMcpConnections` (per-user); for a tool it is the
 * team-wide `mcpToolPrefs.enabled`. Both promotions are routed through
 * `ctx.keepPermanent` by the orchestrator.
 */
export function ConnectorsCategory({ ctx }: { ctx: ToolsCtx }) {
  const connsSwr = useMcpConnections();
  const query = useQueryState(connsSwr);

  return (
    <CategorySection label="Connectors" count={connsSwr.data?.length}>
      <AsyncData
        query={query}
        onRetry={() => void connsSwr.mutate()}
        compact
        emptyTitle="No connections yet"
        emptyBody={
          <>
            Connect external tools your Companion can use.{" "}
            <Link
              href="/connections"
              className="font-semibold text-brand-600 hover:text-brand-700"
            >
              Add a connection →
            </Link>
          </>
        }
      >
        {(connections) => (
          <div>
            {connections.map((c) => (
              <ConnectorRow key={c.id} connection={c} ctx={ctx} />
            ))}
          </div>
        )}
      </AsyncData>
    </CategorySection>
  );
}

function ConnectorRow({
  connection: c,
  ctx,
}: {
  connection: McpConnectionDto;
  ctx: ToolsCtx;
}) {
  const [expanded, setExpanded] = useState(false);
  const connected = c.status === "connected";
  const toolCount = c.capabilities?.tools.length ?? null;
  const key = `conn:${c.id}`;
  const permanentDisabled = ctx.disabledConnections.has(c.id);
  const sessionDisabled = ctx.sessionDisabled[key] === true;
  const effectiveEnabled = !permanentDisabled && !sessionDisabled;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="border-t border-surface-100 first:border-t-0">
      <div className="flex items-center gap-[9px] py-2">
        {connected ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`Expand ${c.name}`}
            onClick={() => setExpanded((e) => !e)}
            className="flex h-[18px] w-[18px] flex-none items-center justify-center text-surface-400 hover:text-surface-500"
          >
            <Chevron className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="h-[18px] w-[18px] flex-none" aria-hidden />
        )}
        <span
          aria-hidden
          className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] text-[11px] font-bold text-white"
          style={glyphStyle(c.slug)}
        >
          {c.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-semibold text-surface-800">
            {c.name}
          </div>
          {toolCount != null && (
            <div className="text-[10.5px] text-surface-500 tabular-nums">
              {toolCount} {toolCount === 1 ? "tool" : "tools"}
            </div>
          )}
        </div>
        <ScopeBadge scope={c.ownerScope} />
        <span className="ml-auto flex flex-none items-center">
          {connected ? (
            <EnableSwitch
              enabled={effectiveEnabled}
              isPermanentlyDisabled={permanentDisabled}
              conversationId={ctx.conversationId}
              sessionKey={key}
              label={`Use ${c.name} in chat`}
              onToggleSession={(d) => ctx.toggleSession(key, d)}
              onKeepPermanently={(d) => ctx.keepPermanent(key, d)}
            />
          ) : (
            <StatusPill status={c.status} authType={c.authType} />
          )}
        </span>
      </div>
      {connected && expanded && <ConnectorTools connectionId={c.id} ctx={ctx} />}
    </div>
  );
}

function ConnectorTools({
  connectionId,
  ctx,
}: {
  connectionId: string;
  ctx: ToolsCtx;
}) {
  const toolsSwr = useMcpConnectionTools(connectionId);
  const query = useQueryState(toolsSwr);
  return (
    <div className="mb-0.5 ml-[31px] border-l border-surface-100 pl-2.5">
      <AsyncData
        query={query}
        onRetry={() => void toolsSwr.mutate()}
        compact
        emptyTitle="No tools discovered"
        emptyBody="This server hasn't reported any tools yet."
      >
        {(tools) => (
          <div>
            {tools.map((t) => (
              <ConnectorToolRow
                key={t.name}
                connectionId={connectionId}
                tool={t}
                ctx={ctx}
              />
            ))}
          </div>
        )}
      </AsyncData>
    </div>
  );
}

function ConnectorToolRow({
  connectionId,
  tool,
  ctx,
}: {
  connectionId: string;
  tool: McpToolDto;
  ctx: ToolsCtx;
}) {
  const key = `conntool:${connectionId}:${tool.name}`;
  const permanentDisabled = !tool.enabled; // team-wide mcpToolPrefs.enabled
  const sessionDisabled = ctx.sessionDisabled[key] === true;
  const effectiveEnabled = !permanentDisabled && !sessionDisabled;
  return (
    <div className="flex items-center gap-2 border-t border-surface-100 py-1.5 first:border-t-0">
      <span
        className="min-w-0 truncate font-mono text-[11px] font-medium text-surface-700"
        title={tool.description ?? undefined}
      >
        {tool.name}
      </span>
      <span className="ml-auto flex-none">
        <PermClassTag cls={tool.permClass} />
      </span>
      <EnableSwitch
        enabled={effectiveEnabled}
        isPermanentlyDisabled={permanentDisabled}
        conversationId={ctx.conversationId}
        sessionKey={key}
        label={`Enable ${tool.name}`}
        onToggleSession={(d) => ctx.toggleSession(key, d)}
        onKeepPermanently={(d) => ctx.keepPermanent(key, d)}
      />
    </div>
  );
}
