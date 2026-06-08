// apps/web/src/app/(dashboard)/ai/_components/generative/diff-gate.tsx
"use client";
import { Plus, Pencil, Trash2, Undo2 } from "lucide-react";
import type { ScenarioOverrideDelta } from "../types";

/** Fields hidden from the diff — identifiers + audit columns carry no user meaning. */
const HIDDEN_FIELDS = new Set([
  "id", "companyId", "scenarioId", "createdAt", "updatedAt", "deletedAt", "aiConversationId",
]);

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function humanizeEntity(entityType: string): string {
  return entityType.replace(/_/g, " ");
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.map(formatVal).join(", ");
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .filter(([k]) => !HIDDEN_FIELDS.has(k))
      .map(([k, val]) => `${humanizeKey(k)}: ${formatVal(val)}`)
      .join(", ");
  }
  return String(v);
}

interface DiffRow {
  key: string;
  before?: unknown;
  after?: unknown;
}

/** Build the visible rows for one delta. */
function rowsFor(delta: ScenarioOverrideDelta): DiffRow[] {
  const { action, before, after } = delta;
  if (action === "create") {
    return Object.entries(after ?? {})
      .filter(([k]) => !HIDDEN_FIELDS.has(k))
      .map(([key, value]) => ({ key, after: value }));
  }
  if (action === "delete" || action === "remove_override") {
    return Object.entries(before ?? {})
      .filter(([k]) => !HIDDEN_FIELDS.has(k))
      .map(([key, value]) => ({ key, before: value }));
  }
  // modify: only fields whose stringified value changed.
  const b = before ?? {};
  const a = after ?? {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const rows: DiffRow[] = [];
  for (const key of keys) {
    if (HIDDEN_FIELDS.has(key)) continue;
    const bv = (b as Record<string, unknown>)[key];
    const av = (a as Record<string, unknown>)[key];
    if (formatVal(bv) !== formatVal(av)) rows.push({ key, before: bv, after: av });
  }
  return rows;
}

const HEADERS: Record<ScenarioOverrideDelta["action"], { label: string; Icon: typeof Plus; tone: string }> = {
  create: { label: "Create", Icon: Plus, tone: "text-success-600" },
  modify: { label: "Update", Icon: Pencil, tone: "text-brand-600" },
  delete: { label: "Delete", Icon: Trash2, tone: "text-danger-600" },
  remove_override: { label: "Remove scenario change to", Icon: Undo2, tone: "text-danger-600" },
};

function DiffEntity({ delta }: { delta: ScenarioOverrideDelta }) {
  const { label, Icon, tone } = HEADERS[delta.action]!;
  const rows = rowsFor(delta);
  const showBefore = delta.action === "modify" || delta.action === "delete" || delta.action === "remove_override";
  const showAfter = delta.action === "create" || delta.action === "modify";

  return (
    <div className="rounded-xl border border-surface-200 bg-surface-0 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
        <Icon className={`h-3.5 w-3.5 ${tone}`} />
        <span className={tone}>{label}</span>
        <span className="text-surface-600">{humanizeEntity(delta.entityType)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-surface-400">No field changes.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[minmax(0,7rem)_1fr] items-baseline gap-2 text-xs">
              <span className="truncate text-surface-500">{humanizeKey(r.key)}</span>
              <span className="flex flex-wrap items-baseline gap-1.5 tabular-nums">
                {showBefore ? (
                  <span className={`text-surface-500 ${delta.action !== "delete" && delta.action !== "remove_override" ? "line-through" : ""}`}>
                    {formatVal(r.before)}
                  </span>
                ) : null}
                {showBefore && showAfter ? <span className="text-surface-300">→</span> : null}
                {showAfter ? <span className="font-medium text-surface-800">{formatVal(r.after)}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The diff-gate before/after view rendered inside the permission card (spec §4.2). */
export function DiffGate({ override }: { override: ScenarioOverrideDelta[] }) {
  if (!override || override.length === 0) return null;
  return (
    <div className="mb-3 flex flex-col gap-2">
      {override.map((delta, i) => (
        <DiffEntity key={`${delta.entityType}-${delta.entityId}-${i}`} delta={delta} />
      ))}
    </div>
  );
}
