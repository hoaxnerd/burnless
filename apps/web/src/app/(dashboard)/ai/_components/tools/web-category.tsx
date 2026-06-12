"use client";

import { useEffect, useState } from "react";
import { Globe, MonitorPlay, Download } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { KEYS, revalidate } from "@/lib/swr";
import { useAiPermissions, useBrowserAvailability } from "@/lib/swr/hooks";
import { useCapabilities } from "@/components/providers/capability-context";
import { SegmentedControl } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/mcp/status-pill";
import { CategorySection } from "./category-section";
import { EnableSwitch } from "./enable-switch";
import { PostureControl, type PostureMode } from "./posture-control";
import type { ToolsCtx } from "./tools-ctx";

/**
 * WebCategory (S3b §6) — the Web section.
 *
 * Row 1 — Web search: an enablement {@link ToolSwitch} (session-default) + a
 * webSearchMode posture {@link SegmentedControl}. The switch governs BOTH
 * built-in web tool names (`search_web` AND `read_webpage`) — disabling web
 * search drops both from the offered tool set — so both keys are routed through
 * the ctx callbacks together (§5).
 *
 * Row 2 — Browser use: HIDDEN when `useCapabilities().stdioMcp === false`
 * (cloud can't spawn local processes). On self-host, `useBrowserAvailability()`
 * drives a not-ready setup card (POST /api/browser/install → revalidate) vs a
 * ready browserUseMode posture control.
 */
const WEB_TOOL_KEYS = ["builtin:search_web", "builtin:read_webpage"] as const;

export function WebCategory({ ctx }: { ctx: ToolsCtx }) {
  const caps = useCapabilities();
  return (
    <CategorySection label="Web">
      <WebSearchRow ctx={ctx} />
      {caps.stdioMcp && <BrowserUseRow />}
    </CategorySection>
  );
}

function WebSearchRow({ ctx }: { ctx: ToolsCtx }) {
  // Web search is enabled unless either web tool name is disabled (permanent or
  // session). The EnableSwitch reflects/controls both names as one unit — its
  // session/permanent callbacks fan out across BOTH keys (§5).
  const permanentDisabled = WEB_TOOL_KEYS.some((k) =>
    ctx.disabledBuiltins.has(k.slice("builtin:".length)),
  );
  const sessionDisabled = WEB_TOOL_KEYS.some((k) => ctx.sessionDisabled[k] === true);
  const enabled = !permanentDisabled && !sessionDisabled;

  return (
    <div className="border-t border-surface-100 py-[9px] first:border-t-0">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] bg-surface-100 text-surface-600">
          <Globe className="h-[13px] w-[13px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-surface-800">Web search</div>
          <div className="text-[10.5px] text-surface-500">DuckDuckGo · keyless</div>
        </div>
        <EnableSwitch
          enabled={enabled}
          isPermanentlyDisabled={permanentDisabled}
          conversationId={ctx.conversationId}
          sessionKey="builtin:search_web"
          label="Use web search in chat"
          // Fan out across BOTH web tool names, but SEQUENTIALLY — toggleSession /
          // keepPermanent are read-modify-write (the session map / the prefs array);
          // firing them concurrently (Promise.all) races and drops one key
          // (last-write-wins), leaving web search half-disabled. Awaiting in series
          // serializes the writes so both keys land.
          onToggleSession={async (d) => {
            for (const k of WEB_TOOL_KEYS) await ctx.toggleSession(k, d);
          }}
          onKeepPermanently={async (d) => {
            for (const k of WEB_TOOL_KEYS) await ctx.keepPermanent(k, d);
          }}
        />
      </div>
      <PostureRow modeKey="webSearchMode" label="Web search posture" />
    </div>
  );
}

function BrowserUseRow() {
  const availSwr = useBrowserAvailability();
  const avail = availSwr.data;
  const ready = avail?.connected === true && avail?.chromiumInstalled === true;
  const [installing, setInstalling] = useState(false);

  async function setup() {
    if (installing) return;
    setInstalling(true);
    try {
      await apiFetch("/api/browser/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      await revalidate(KEYS.browserAvailability);
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="border-t border-surface-100 py-[9px]">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] bg-surface-100 text-surface-600">
          <MonitorPlay className="h-[13px] w-[13px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-surface-800">Browser use</div>
          <div className="text-[10.5px] text-surface-500">Drive a real browser · self-host</div>
        </div>
        {ready ? (
          <StatusPill status="connected" authType="none" />
        ) : (
          <span className="inline-flex flex-none items-center gap-[5px] rounded-full bg-warning-50 px-[9px] py-[3px] text-[10.5px] font-semibold text-warning-600">
            <span className="h-1.5 w-1.5 rounded-full bg-warning-500" />
            Not set up
          </span>
        )}
      </div>
      {ready ? (
        <PostureRow modeKey="browserUseMode" label="Browser use posture" />
      ) : (
        <div className="mt-1.5 rounded-lg border border-dashed border-warning-500 bg-warning-50 p-[11px]">
          <div className="flex items-center gap-2 text-xs font-semibold text-warning-700">
            <MonitorPlay className="h-3.5 w-3.5" />
            Set up browser control
          </div>
          <p className="my-[5px] mt-1.5 text-[11px] leading-[1.45] text-surface-600">
            Connects the Playwright MCP server and installs Chromium, so the AI
            can navigate sites, click, and read rendered pages.
          </p>
          <Button
            size="sm"
            icon={<Download className="h-[13px] w-[13px]" />}
            state={installing ? "loading" : "idle"}
            onClick={() => void setup()}
          >
            Set up browser
          </Button>
        </div>
      )}
    </div>
  );
}

/** Web/Workspace posture segmented over the existing /api/ai/permissions modes. */
function PostureRow({
  modeKey,
  label,
}: {
  modeKey: "webSearchMode" | "browserUseMode";
  label: string;
}) {
  const { data } = useAiPermissions();
  const [overlay, setOverlay] = useState<PostureMode | null>(null);
  useEffect(() => setOverlay(null), [data]);
  const value = (overlay ?? data?.defaults[modeKey] ?? "ask") as PostureMode;

  async function setMode(v: PostureMode) {
    setOverlay(v);
    await apiFetch("/api/ai/permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [modeKey]: v }),
    });
    await revalidate(KEYS.aiPermissions);
  }

  return <PostureControl label={label} value={value} onChange={setMode} />;
}
