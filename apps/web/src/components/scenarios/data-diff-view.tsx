"use client";

import { useEffect, useReducer } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { ScenarioBadge } from "./scenario-badge";
import { Skeleton } from "@/components/ui";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface DataDiffViewProps {
  scenarioId: string;
}

interface OverrideSummary {
  modified: number;
  created: number;
  deleted: number;
  total: number;
}

interface OverrideItem {
  id: string;
  entityId: string;
  action: "modify" | "create" | "delete";
  data: Record<string, unknown>;
  originalData?: Record<string, unknown>;
}

interface OverrideGroup {
  entityType: string;
  overrides: OverrideItem[];
}

interface OverridesResponse {
  summary: OverrideSummary;
  groups: OverrideGroup[];
}

/* ── Entity type display names ──────────────────────────────────────────── */

const entityTypeLabels: Record<string, string> = {
  revenue_stream: "Revenue Streams",
  headcount_plan: "Headcount Plans",
  forecast_line: "Forecast Lines",
  funding_round: "Funding Rounds",
  department: "Departments",
  financial_account: "Financial Accounts",
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** Map override action to ScenarioBadge variant */
function actionToVariant(action: OverrideItem["action"]): "modified" | "created" | "deleted" {
  switch (action) {
    case "modify":
      return "modified";
    case "create":
      return "created";
    case "delete":
      return "deleted";
  }
}

/** Format a field value for display */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    // Format percentages nicely
    if (Math.abs(value) < 1 && value !== 0) {
      return `${(value * 100).toFixed(1)}%`;
    }
    return value.toLocaleString();
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Get changed fields between data and originalData */
function getFieldChanges(
  data: Record<string, unknown>,
  originalData: Record<string, unknown>,
): { field: string; from: unknown; to: unknown }[] {
  const changes: { field: string; from: unknown; to: unknown }[] = [];
  const allKeys = new Set([...Object.keys(data), ...Object.keys(originalData)]);

  for (const key of allKeys) {
    // Skip internal fields
    if (key === "id" || key === "createdAt" || key === "updatedAt") continue;

    const oldVal = originalData[key];
    const newVal = data[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field: key, from: oldVal, to: newVal });
    }
  }

  return changes;
}

/** Get entity display name from data */
function getEntityName(item: OverrideItem): string {
  const data = item.data;
  return (
    (data.name as string) ||
    (data.title as string) ||
    (data.label as string) ||
    item.entityId.slice(0, 8)
  );
}

/* ── Fetch reducer ─────────────────────────────────────────────────────── */

type FetchState = { data: OverridesResponse | null; loading: boolean; error: string | null };
type FetchAction =
  | { type: "FETCH" }
  | { type: "SUCCESS"; data: OverridesResponse }
  | { type: "ERROR"; error: string };

function fetchReducer(_state: FetchState, action: FetchAction): FetchState {
  switch (action.type) {
    case "FETCH":
      return { data: null, loading: true, error: null };
    case "SUCCESS":
      return { data: action.data, loading: false, error: null };
    case "ERROR":
      return { data: null, loading: false, error: action.error };
  }
}

const initialFetchState: FetchState = { data: null, loading: true, error: null };

/* ── Component ──────────────────────────────────────────────────────────── */

export function DataDiffView({ scenarioId }: DataDiffViewProps) {
  const [{ data, loading, error }, dispatch] = useReducer(fetchReducer, initialFetchState);

  useEffect(() => {
    const controller = new AbortController();
    dispatch({ type: "FETCH" });

    apiFetch(`/api/scenarios/overrides?scenarioId=${scenarioId}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load overrides (${res.status})`);
        return res.json();
      })
      .then((json: OverridesResponse) => {
        if (!controller.signal.aborted) dispatch({ type: "SUCCESS", data: json });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        dispatch({ type: "ERROR", error: err instanceof Error ? err.message : "Failed to load overrides" });
      });

    return () => controller.abort();
  }, [scenarioId]);

  /* Loading state */
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  /* Error state */
  if (error) {
    return (
      <div className="rounded-lg bg-danger-50 border border-danger-200 px-4 py-3 text-sm text-danger-700" role="alert">
        {error}
      </div>
    );
  }

  /* No data */
  if (!data || data.summary.total === 0) {
    return (
      <div className="rounded-lg bg-surface-50 border border-surface-200 px-4 py-6 text-center text-sm text-surface-500">
        No changes in this scenario.
      </div>
    );
  }

  const { summary, groups } = data;

  /* Build summary parts */
  const summaryParts: string[] = [];
  if (summary.modified > 0) summaryParts.push(`${summary.modified} modified`);
  if (summary.created > 0) summaryParts.push(`${summary.created} created`);
  if (summary.deleted > 0) summaryParts.push(`${summary.deleted} deleted`);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-2 rounded-lg bg-surface-50 border border-surface-200 px-4 py-2.5">
        <span className="text-sm text-surface-600">
          {summaryParts.join(", ")} — <strong className="text-surface-900">{summary.total} total change{summary.total !== 1 ? "s" : ""}</strong>
        </span>
      </div>

      {/* Grouped overrides */}
      {groups.map((group) => (
        <div key={group.entityType} className="rounded-xl border border-surface-200 overflow-hidden">
          {/* Group header */}
          <div className="bg-surface-50 px-4 py-2.5 border-b border-surface-200">
            <h4 className="text-sm font-semibold text-surface-700">
              {entityTypeLabels[group.entityType] ?? group.entityType}
            </h4>
          </div>

          {/* Override items */}
          <div className="divide-y divide-surface-100">
            {group.overrides.map((item) => (
              <OverrideRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Override Row ─────────────────────────────────────────────────────── */

function OverrideRow({ item }: { item: OverrideItem }) {
  const variant = actionToVariant(item.action);
  const entityName = getEntityName(item);

  return (
    <div className="px-4 py-3">
      {/* Entity name + badge */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm font-medium text-surface-900">{entityName}</span>
        <ScenarioBadge variant={variant} />
      </div>

      {/* Field-level changes for modified entities */}
      {item.action === "modify" && item.originalData && (
        <FieldChanges data={item.data} originalData={item.originalData} />
      )}

      {/* New entity fields summary */}
      {item.action === "create" && (
        <p className="text-xs text-surface-500">New entity added in this scenario</p>
      )}

      {/* Deleted entity note */}
      {item.action === "delete" && (
        <p className="text-xs text-surface-500">Hidden in this scenario</p>
      )}
    </div>
  );
}

/* ── Field Changes ───────────────────────────────────────────────────── */

function FieldChanges({
  data,
  originalData,
}: {
  data: Record<string, unknown>;
  originalData: Record<string, unknown>;
}) {
  const changes = getFieldChanges(data, originalData);

  if (changes.length === 0) {
    return <p className="text-xs text-surface-400">No field changes detected</p>;
  }

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {changes.map(({ field, from, to }) => (
        <span key={field} className="text-xs text-surface-600">
          <span className="font-medium text-surface-700">{field}</span>
          {": "}
          <span className="text-danger-600 line-through">{formatValue(from)}</span>
          {" → "}
          <span className="text-success-700">{formatValue(to)}</span>
        </span>
      ))}
    </div>
  );
}
