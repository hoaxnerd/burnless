"use client";

import { useState, useMemo } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { useRouter } from "next/navigation";
import { Search, Filter, AlertTriangle, RotateCw, ChevronUp, ChevronDown, ChevronsUpDown, Check, Trash2, Tag, Sparkles, Pencil } from "lucide-react";
import { ratioToPct } from "@burnless/engine";
import { formatCompactCurrency } from "@/components/charts";
import { Modal } from "@/components/ui";
import { ExpenseFormModal } from "./expense-form-modal";
import type { ExpenseRow } from "./expense-form";
import type { ForecastMethod } from "@/lib/expense-params";
import type { ExpenseLineItem } from "@/lib/compute-expenses";
import { ScenarioBadge } from "@/components/scenarios/scenario-badge";
import { HiddenEntitiesSection } from "@/components/scenarios/hidden-entities-section";
import { useScenarioOverrides } from "@/components/scenarios/use-scenario-overrides";

interface ExpenseTableProps {
  lineItems: ExpenseLineItem[];
  subcategories: string[];
  /**
   * Live account lookup. When provided, the table renders names via
   * `accountMap.get(item.accountId)?.name` so that renames flow through
   * without needing the upstream compute to bake a fresh `accountName`
   * into every line item. Falls back to the cached `item.accountName`
   * when the map is omitted (back-compat with callers that haven't
   * threaded it yet).
   */
  accountMap?: ReadonlyMap<string, { id: string; name: string }>;
  /** Departments — forwarded to the edit form's optional department dropdown. */
  departments?: Array<{ id: string; name: string }>;
  /** Other forecast lines — used by the edit form's `percentage_of` source dropdown. */
  forecastLines?: Array<{ id: string; name: string }>;
  onDelete?: (ids: string[]) => void;
  onCategoryOverride?: (itemId: string, newSubcategory: string) => void;
}

type SortKey = "accountName" | "subcategory" | "currentAmount" | "changePercent";
type SortDir = "asc" | "desc";

export function ExpenseTable({ lineItems, subcategories, accountMap, departments, forecastLines, onDelete, onCategoryOverride }: ExpenseTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "recurring" | "anomaly">("all");
  const [sortKey, setSortKey] = useState<SortKey>("currentAmount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const {
    isInScenarioMode,
    overrideMap: scenarioOverrideMap,
    deletedEntities,
    handleRevert: handleScenarioRevert,
    handleRemove: handleScenarioRemove,
    handleRestore: handleScenarioRestore,
  } = useScenarioOverrides("forecast_line");

  // Live account-name lookup. Always prefer the live `accountMap` value
  // so a rename ("Slack" → "Notion") propagates without rebuilding line
  // items. Falls back to the cached field for callers that haven't
  // threaded the map yet.
  const resolveName = (item: ExpenseLineItem): string =>
    accountMap?.get(item.accountId)?.name ?? item.accountName;

  // Edit state
  const [editingItem, setEditingItem] = useState<ExpenseLineItem | null>(null);

  // Delete confirmation state
  const [deletingItem, setDeletingItem] = useState<ExpenseLineItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Bulk delete confirmation state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  // Bulk categorize state — accountId selected from the reassign dropdown
  const [bulkAccountId, setBulkAccountId] = useState<string>("");
  const [bulkCategorizing, setBulkCategorizing] = useState(false);
  const [bulkCategorizeError, setBulkCategorizeError] = useState<string | null>(null);

  // List of accounts available to the reassign dropdown — derived from accountMap.
  const accountOptions = useMemo(() => {
    if (!accountMap) return [] as Array<{ id: string; name: string }>;
    return Array.from(accountMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [accountMap]);

  // Filter and sort
  const filtered = useMemo(() => {
    let items = lineItems;

    // Search
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (i) => resolveName(i).toLowerCase().includes(q) || i.subcategory.toLowerCase().includes(q),
      );
    }

    // Category filter
    if (categoryFilter !== "all") {
      items = items.filter((i) => i.subcategory === categoryFilter);
    }

    // Type filter
    if (typeFilter === "recurring") items = items.filter((i) => i.isRecurring);
    if (typeFilter === "anomaly") items = items.filter((i) => i.isAnomaly);

    // Sort
    items = [...items].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "accountName") cmp = resolveName(a).localeCompare(resolveName(b));
      else if (sortKey === "subcategory") cmp = a.subcategory.localeCompare(b.subcategory);
      else if (sortKey === "currentAmount") cmp = a.currentAmount - b.currentAmount;
      else if (sortKey === "changePercent") cmp = a.changePercent - b.changePercent;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return items;
  }, [lineItems, search, categoryFilter, typeFilter, sortKey, sortDir, accountMap]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((i) => i.id)));
  };

  const sortIcon = (col: SortKey) => {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const isSynthetic = (item: ExpenseLineItem) => item.id === "headcount-synthetic";

  async function handleDeleteConfirm() {
    if (!deletingItem) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      const res = await apiFetch(`/api/forecast-lines/${deletingItem.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete expense");
      }

      setDeletingItem(null);
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeleting(false);
    }
  }

  async function handleBulkDeleteConfirm() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    setBulkDeleteError(null);

    try {
      const res = await apiFetch("/api/forecast-lines/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete expenses");
      }
      // Notify parent (legacy onDelete prop) and clear local state.
      onDelete?.(ids);
      setSelected(new Set());
      setBulkDeleteOpen(false);
      router.refresh();
    } catch (err) {
      setBulkDeleteError(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleBulkCategorize(newAccountId: string) {
    const ids = Array.from(selected);
    if (ids.length === 0 || !newAccountId) return;
    setBulkCategorizing(true);
    setBulkCategorizeError(null);

    try {
      const res = await apiFetch("/api/forecast-lines/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "categorize",
          ids,
          accountId: newAccountId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to reassign expenses");
      }
      setSelected(new Set());
      setBulkAccountId("");
      router.refresh();
    } catch (err) {
      setBulkCategorizeError(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setBulkCategorizing(false);
    }
  }

  return (
    <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
      {/* Header with search and filters */}
      <div className="px-6 py-4 border-b border-surface-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <h2 className="text-lg font-semibold text-surface-900 flex-shrink-0">
            Expense Items
            <span className="ml-2 text-xs font-normal text-surface-400">
              {filtered.length} of {lineItems.length}
            </span>
          </h2>

          <div className="flex flex-1 items-center gap-2 w-full sm:w-auto sm:ml-auto">
            {/* Search */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-400" />
              <input
                type="text"
                placeholder="Search expenses..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-surface-200 bg-surface-50 pl-9 pr-3 py-1.5 text-xs text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors"
              />
            </div>

            {/* Category filter */}
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-surface-400 pointer-events-none" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="appearance-none rounded-lg border border-surface-200 bg-surface-50 pl-7 pr-6 py-1.5 text-xs text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 cursor-pointer"
              >
                <option value="all">All categories</option>
                {subcategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Type filter pills */}
            <div className="hidden sm:flex items-center gap-1">
              {(["all", "recurring", "anomaly"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                    typeFilter === t
                      ? "bg-brand-100 text-brand-700"
                      : "text-surface-500 hover:bg-surface-100"
                  }`}
                >
                  {t === "all" ? "All" : t === "recurring" ? "Recurring" : "Anomalies"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-surface-400">
          Plan detail — your modelled forecast lines. Category totals above are actuals-blended and may differ.
        </p>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="px-6 py-2 bg-brand-50 border-b border-brand-100 flex flex-wrap items-center gap-3 animate-slide-up">
          <span className="text-xs font-medium text-brand-700">
            {selected.size} selected
          </span>

          {/* Bulk reassign — pool comes from the same accountMap threaded
              into the table by the parent view. */}
          {accountOptions.length > 0 && (
            <label className="inline-flex items-center gap-1.5">
              <Tag className="h-3 w-3 text-brand-700" aria-hidden />
              <span className="sr-only">Reassign to account</span>
              <select
                aria-label="Reassign selected expenses to account"
                value={bulkAccountId}
                disabled={bulkCategorizing}
                onChange={(e) => {
                  const next = e.target.value;
                  setBulkAccountId(next);
                  if (next) void handleBulkCategorize(next);
                }}
                className="appearance-none rounded-md border border-brand-200 bg-white px-2 py-1 text-[10px] font-medium text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 cursor-pointer disabled:opacity-50"
              >
                <option value="">Reassign to...</option>
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
          )}

          <button
            type="button"
            onClick={() => {
              setBulkDeleteError(null);
              setBulkDeleteOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1 text-[10px] font-medium text-red-600 hover:bg-red-100 transition-colors"
          >
            <Trash2 className="h-3 w-3" /> Delete {selected.size} selected
          </button>

          {bulkCategorizeError && (
            <span className="text-[10px] text-danger-600">
              {bulkCategorizeError}
            </span>
          )}

          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-[10px] text-surface-500 hover:text-surface-700"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 bg-surface-50">
              <th scope="col" className="w-10 px-4 py-3">
                <button onClick={toggleAll} aria-label="Select all expenses" className="flex items-center justify-center">
                  <div className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                    selected.size === filtered.length && filtered.length > 0
                      ? "bg-brand-600 border-brand-600"
                      : "border-surface-300"
                  }`}>
                    {selected.size === filtered.length && filtered.length > 0 && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </div>
                </button>
              </th>
              <th
                scope="col"
                className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase cursor-pointer select-none hover:text-surface-700 transition-colors"
                onClick={() => handleSort("accountName")}
              >
                <span className="inline-flex items-center gap-1">
                  Expense {sortIcon("accountName")}
                </span>
              </th>
              <th
                scope="col"
                className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase cursor-pointer select-none hover:text-surface-700 transition-colors"
                onClick={() => handleSort("subcategory")}
              >
                <span className="inline-flex items-center gap-1">
                  Category {sortIcon("subcategory")}
                </span>
              </th>
              <th
                scope="col"
                className="text-right px-4 py-3 text-xs font-medium text-surface-500 uppercase cursor-pointer select-none hover:text-surface-700 transition-colors"
                onClick={() => handleSort("currentAmount")}
              >
                <span className="inline-flex items-center gap-1 justify-end">
                  Monthly {sortIcon("currentAmount")}
                </span>
              </th>
              <th
                scope="col"
                className="text-right px-4 py-3 text-xs font-medium text-surface-500 uppercase cursor-pointer select-none hover:text-surface-700 transition-colors"
                onClick={() => handleSort("changePercent")}
              >
                <span className="inline-flex items-center gap-1 justify-end">
                  Trend {sortIcon("changePercent")}
                </span>
              </th>
              <th scope="col" className="text-center px-4 py-3 text-xs font-medium text-surface-500 uppercase">
                Flags
              </th>
              <th scope="col" className="w-20 px-4 py-3 text-xs font-medium text-surface-500 uppercase text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center">
                  <p className="text-sm text-surface-500">
                    {search || categoryFilter !== "all" || typeFilter !== "all"
                      ? "No expenses match your filters."
                      : "No expenses recorded yet."}
                  </p>
                  <p className="text-xs text-surface-400 mt-1">
                    {search ? "Try broadening your search." : "Add expenses to start tracking spend."}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const isSelected = selected.has(item.id);
                const displayName = resolveName(item);
                const changeIcon = item.changePercent > 0.01 ? "\u2191" : item.changePercent < -0.01 ? "\u2193" : "\u2192";
                const changeLabel = item.changePercent > 0.01 ? "Increasing" : item.changePercent < -0.01 ? "Decreasing" : "Stable";
                const changeColor = item.changePercent > 0.01 ? "text-red-600" : item.changePercent < -0.01 ? "text-green-600" : "text-surface-500";
                const synthetic = isSynthetic(item);
                const scenarioOverride = isInScenarioMode ? scenarioOverrideMap.get(item.id) : undefined;
                const overrideTag = scenarioOverride?.action === "modify" ? "modified" as const : scenarioOverride?.action === "create" ? "created" as const : null;
                const rowBorderClass = overrideTag === "modified" ? "border-l-3 border-l-warning-500" : overrideTag === "created" ? "border-l-3 border-l-success-500" : "";

                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-surface-50 transition-colors ${isSelected ? "bg-brand-50/50" : ""} ${rowBorderClass}`}
                  >
                    <td className="w-10 px-4 py-3">
                      <button onClick={() => toggleSelect(item.id)} aria-label={`Select ${displayName}`} className="flex items-center justify-center">
                        <div className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                          isSelected ? "bg-brand-600 border-brand-600" : "border-surface-300 hover:border-surface-400"
                        }`}>
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-surface-900">{displayName}</span>
                        <span className="ml-1 text-[10px] text-surface-400 uppercase">{item.method}</span>
                        {overrideTag && <ScenarioBadge variant={overrideTag} />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative flex items-center gap-1.5">
                        {editingCategoryId === item.id ? (
                          <select
                            autoFocus
                            defaultValue={overrides[item.id] ?? item.subcategory}
                            onChange={(e) => {
                              const newCat = e.target.value;
                              setOverrides((prev) => ({ ...prev, [item.id]: newCat }));
                              setEditingCategoryId(null);
                              onCategoryOverride?.(item.id, newCat);
                              // Learn: save merchant->category mapping
                              apiFetch("/api/merchant-mappings", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  description: displayName,
                                  accountId: item.accountId,
                                  category: item.accountCategory,
                                  subcategory: newCat,
                                }),
                              }).catch(() => {});
                            }}
                            onBlur={() => setEditingCategoryId(null)}
                            className="rounded-md border border-brand-300 bg-white px-2 py-0.5 text-[10px] font-medium text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                          >
                            {subcategories.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        ) : (
                          <button
                            onClick={() => setEditingCategoryId(item.id)}
                            className="inline-flex items-center rounded-md bg-surface-100 px-2 py-0.5 text-[10px] font-medium text-surface-600 hover:bg-surface-200 hover:text-surface-800 transition-colors cursor-pointer"
                            title="Click to change category"
                          >
                            {overrides[item.id] ?? item.subcategory}
                          </button>
                        )}
                        {item.categorySource === "rule" && !overrides[item.id] && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-medium text-violet-600"
                            title={`AI categorized (${Math.round(ratioToPct(item.subcategoryConfidence))}% confidence)`}
                          >
                            <Sparkles className="h-2.5 w-2.5" /> AI
                          </span>
                        )}
                        {(item.categorySource === "merchant_memory" || overrides[item.id]) && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-green-50 px-1.5 py-0.5 text-[9px] font-medium text-green-600"
                            title={overrides[item.id] ? "You overrode this category" : "Learned from your override"}
                          >
                            <Sparkles className="h-2.5 w-2.5" /> {overrides[item.id] ? "Override" : "Learned"}
                          </span>
                        )}
                        {item.subcategoryConfidence < 0.7 && item.categorySource !== "merchant_memory" && !overrides[item.id] && (
                          <span className="text-[9px] text-surface-400" title="Low confidence categorization">
                            ?
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold tabular-nums text-surface-900">
                        {formatCompactCurrency(item.currentAmount)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-medium tabular-nums ${changeColor}`}>
                        <span className="sr-only">{changeLabel}</span>
                        {changeIcon} {Math.abs(ratioToPct(item.changePercent)).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {item.isRecurring && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[9px] font-medium text-brand-600" title="Recurring expense">
                            <RotateCw className="h-2.5 w-2.5" />
                          </span>
                        )}
                        {item.isAnomaly && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-warning-50 px-1.5 py-0.5 text-[9px] font-medium text-warning-600" title="Unusual spend increase">
                            <AlertTriangle className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {overrideTag === "modified" && (
                          <button
                            onClick={() => handleScenarioRevert(item.id)}
                            className="rounded-md p-1.5 text-warning-500 hover:text-warning-700 hover:bg-warning-50 transition-colors"
                            title="Revert to base"
                            aria-label={`Revert ${displayName}`}
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {overrideTag === "created" && (
                          <button
                            onClick={() => handleScenarioRemove(item.id)}
                            className="rounded-md p-1.5 text-danger-500 hover:text-danger-700 hover:bg-danger-50 transition-colors"
                            title="Remove scenario entity"
                            aria-label={`Remove ${displayName}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {!synthetic && (
                          <>
                            <button
                              onClick={() => setEditingItem(item)}
                              className="rounded-md p-1.5 text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                              title="Edit expense"
                              aria-label={`Edit ${displayName}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setDeleteError(null);
                                setDeletingItem(item);
                              }}
                              className="rounded-md p-1.5 text-surface-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title={overrideTag ? "Delete (creates a scenario delete override)" : "Delete expense"}
                              aria-label={`Delete ${displayName}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Edit expense modal */}
      {editingItem && (
        <ExpenseFormModal
          mode="edit"
          open={!!editingItem}
          onClose={() => setEditingItem(null)}
          accounts={accountOptions}
          departments={departments}
          forecastLines={(forecastLines ?? []).filter((l) => l.id !== editingItem.id)}
          initialValue={lineItemToExpenseRow(editingItem)}
        />
      )}

      {/* Delete confirmation modal */}
      <Modal
        open={!!deletingItem}
        onClose={() => { setDeletingItem(null); setDeleteError(null); }}
        title="Delete Expense"
        size="sm"
      >
        <div className="space-y-4">
          {deleteError && (
            <div className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600">
              {deleteError}
            </div>
          )}
          <p className="text-sm text-surface-700">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-surface-900">{deletingItem ? resolveName(deletingItem) : ""}</span>?
            This will remove the forecast line permanently.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setDeletingItem(null); setDeleteError(null); }}
              className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Bulk delete confirmation modal */}
      <Modal
        open={bulkDeleteOpen}
        onClose={() => { setBulkDeleteOpen(false); setBulkDeleteError(null); }}
        title="Delete selected expenses"
        size="sm"
      >
        <div className="space-y-4">
          {bulkDeleteError && (
            <div className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600">
              {bulkDeleteError}
            </div>
          )}
          <p className="text-sm text-surface-700">
            Delete{" "}
            <span className="font-semibold text-surface-900">{selected.size}</span>{" "}
            forecast {selected.size === 1 ? "line" : "lines"}? This action removes them permanently.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setBulkDeleteOpen(false); setBulkDeleteError(null); }}
              className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleBulkDeleteConfirm}
              disabled={bulkDeleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {bulkDeleting ? "Deleting..." : `Delete ${selected.size}`}
            </button>
          </div>
        </div>
      </Modal>

      {/* Hidden in scenario section */}
      {isInScenarioMode && (
        <HiddenEntitiesSection
          deletedEntities={deletedEntities}
          entityLabel="expense"
          onRestore={handleScenarioRestore}
        />
      )}
    </div>
  );
}

/**
 * Map a compute-layer `ExpenseLineItem` to the `<ExpenseForm>`'s
 * `ExpenseRow` shape. The compute layer surfaces a derived boolean
 * `isRecurring`; we restore the tri-state by checking `recurringSource` —
 * `"user"` means the DB column was non-null and reflects an explicit user
 * choice; otherwise, expose `null` so the form's "Auto-detect" option is
 * preselected.
 *
 * `vendor`, `notes`, and `departmentId` are threaded through from the
 * underlying forecast-line row so an edit that doesn't touch them re-PATCHes
 * the same persisted values rather than nulling them out (Phase 1 §2.C
 * data-loss guard).
 */
function lineItemToExpenseRow(item: ExpenseLineItem): ExpenseRow {
  return {
    id: item.id,
    accountId: item.accountId,
    method: item.method as ForecastMethod,
    parameters: item.parameters,
    startDate: item.startDate,
    endDate: item.endDate,
    frequency: item.frequency,
    isOneTime: item.isOneTime,
    isRecurring: item.recurringSource === "user" ? item.isRecurring : null,
    vendor: item.vendor,
    notes: item.notes,
    departmentId: item.departmentId,
  };
}
