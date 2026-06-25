"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, SquarePen, Trash2, ChevronDown, ChevronRight, Search } from "lucide-react";
import { listBuiltinToolsForControl } from "@burnless/ai";
import { apiFetch } from "@/lib/api-fetch";
import { KEYS, revalidate } from "@/lib/swr";
import { useAiPermissions, useAiDomainTools } from "@/lib/swr/hooks";
import { PermClassTag } from "@/components/mcp/perm-class-tag";
import { CategorySection } from "./category-section";
import { PostureControl, type PostureMode } from "./posture-control";
import { EnableSwitch } from "./enable-switch";
import type { ToolsCtx } from "./tools-ctx";

/**
 * WorkspaceCategory (S3b §5, §7) — the AI's built-in financial tools.
 *
 * Top: three posture rows (read / write / delete) over the existing
 * `aiPermissionDefaults` modes via /api/ai/permissions (delete: ask·session
 * only — no permanent allow). Below: a collapsible "Individual built-in tools"
 * disclosure — a client-side search + a per-tool EnableSwitch (key
 * `builtin:<name>`) for every controllable built-in. web_search / browser_use
 * built-ins are excluded (they live in the Web category).
 */

type DeleteMode = "ask" | "session";

const POSTURE_ROWS: {
  modeKey: "readMode" | "writeMode" | "deleteMode";
  label: string;
  hint: string;
  cls: "read" | "write" | "delete";
  icon: React.ReactNode;
  allowAlways: boolean;
}[] = [
  { modeKey: "readMode", label: "Read data", hint: "Metrics, statements, comparisons", cls: "read", icon: <Eye className="h-3.5 w-3.5" />, allowAlways: true },
  { modeKey: "writeMode", label: "Create / update", hint: "Scenarios, revenue, headcount…", cls: "write", icon: <SquarePen className="h-3.5 w-3.5" />, allowAlways: true },
  { modeKey: "deleteMode", label: "Delete", hint: "Destructive — no permanent allow", cls: "delete", icon: <Trash2 className="h-3.5 w-3.5" />, allowAlways: false },
];

/** PermClassTag only renders read/write/delete; map web/browser → read (never hit
 *  here, those are filtered out of the Workspace list). */
function toPermClass(category: string): "read" | "write" | "delete" {
  return category === "write" || category === "delete" ? category : "read";
}

export function WorkspaceCategory({ ctx }: { ctx: ToolsCtx }) {
  // Active non-finance domain tools (A3b-3) — fetched server-side because which
  // domains are active is company-scoped. Finance tools are bundled client-side
  // (listBuiltinToolsForControl reads them statically). Absent/loading → finance
  // only, so domain tools just stream in when the fetch resolves.
  const { data: domainData } = useAiDomainTools();
  // Controllable built-ins (finance + domain), excluding the web tools (owned by
  // the Web category).
  const tools = useMemo(
    () =>
      listBuiltinToolsForControl(domainData?.tools ?? []).filter(
        (t) => t.category !== "web_search" && t.category !== "browser_use",
      ),
    [domainData],
  );

  const offCount = tools.reduce((n, t) => {
    const key = `builtin:${t.name}`;
    const off = ctx.disabledBuiltins.has(t.name) || ctx.sessionDisabled[key] === true;
    return n + (off ? 1 : 0);
  }, 0);

  return (
    <CategorySection label="Workspace" count="built-in">
      {POSTURE_ROWS.map((row) => (
        <PostureRow key={row.modeKey} row={row} />
      ))}
      <BuiltinToolsDisclosure tools={tools} offCount={offCount} ctx={ctx} />
    </CategorySection>
  );
}

function PostureRow({
  row,
}: {
  row: (typeof POSTURE_ROWS)[number];
}) {
  const { data } = useAiPermissions();
  const [overlay, setOverlay] = useState<PostureMode | null>(null);
  useEffect(() => setOverlay(null), [data]);
  const value = (overlay ?? data?.defaults[row.modeKey] ?? "ask") as PostureMode;

  async function setMode(v: PostureMode) {
    setOverlay(v);
    await apiFetch("/api/ai/permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [row.modeKey]: row.modeKey === "deleteMode" ? (v as DeleteMode) : v }),
    });
    await revalidate(KEYS.aiPermissions);
  }

  return (
    <div className="border-t border-surface-100 py-[9px] first:border-t-0">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex-none text-surface-500">{row.icon}</span>
        <span className="text-[12.5px] font-semibold text-surface-800">{row.label}</span>
        <span className="text-[10.5px] text-surface-500">{row.hint}</span>
        <span className="ml-auto flex-none">
          <PermClassTag cls={row.cls} />
        </span>
      </div>
      <PostureControl
        label={`${row.label} posture`}
        value={value}
        onChange={setMode}
        allowAlways={row.allowAlways}
      />
    </div>
  );
}

function BuiltinToolsDisclosure({
  tools,
  offCount,
  ctx,
}: {
  tools: { name: string; category: string }[];
  offCount: number;
  ctx: ToolsCtx;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const Chevron = open ? ChevronDown : ChevronRight;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? tools.filter((t) => t.name.toLowerCase().includes(q)) : tools;
  }, [tools, search]);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-[5px] px-0.5 pt-[9px] pb-1 text-[10.5px] font-semibold text-brand-600"
      >
        <Chevron className="h-[13px] w-[13px]" />
        Individual built-in tools
        {offCount > 0 && (
          <span className="font-medium text-surface-400">· {offCount} off</span>
        )}
      </button>
      {open && (
        <div className="mb-0.5 ml-0.5 border-l border-surface-100 pl-2.5">
          <label className="my-1 mb-1 flex items-center gap-[7px] rounded-md border border-surface-200 bg-surface-50 px-[9px] py-1.5">
            <Search className="h-[13px] w-[13px] flex-none text-surface-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${tools.length} built-in tools…`}
              aria-label="Search built-in tools"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-surface-700 placeholder:text-surface-400 focus:outline-none"
            />
          </label>
          {filtered.map((t) => (
            <BuiltinToolRow key={t.name} tool={t} ctx={ctx} />
          ))}
        </div>
      )}
    </div>
  );
}

function BuiltinToolRow({
  tool,
  ctx,
}: {
  tool: { name: string; category: string };
  ctx: ToolsCtx;
}) {
  const key = `builtin:${tool.name}`;
  const permanentDisabled = ctx.disabledBuiltins.has(tool.name);
  const sessionDisabled = ctx.sessionDisabled[key] === true;
  const effectiveEnabled = !permanentDisabled && !sessionDisabled;
  return (
    <div className="flex items-center gap-2 border-t border-surface-100 py-1.5 first:border-t-0">
      <span className="min-w-0 truncate font-mono text-[11px] font-medium text-surface-700">
        {tool.name}
      </span>
      <span className="ml-auto flex-none">
        <PermClassTag cls={toPermClass(tool.category)} />
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
