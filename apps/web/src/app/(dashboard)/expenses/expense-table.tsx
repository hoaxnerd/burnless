"use client";

import { useState, useMemo } from "react";
import { Search, Filter, AlertTriangle, RotateCw, ChevronUp, ChevronDown, ChevronsUpDown, Check, Trash2, Tag, Sparkles } from "lucide-react";
import { formatCompactCurrency } from "@/components/charts";
import type { ExpenseLineItem } from "@/lib/compute-expenses";

interface ExpenseTableProps {
  lineItems: ExpenseLineItem[];
  subcategories: string[];
  onDelete?: (ids: string[]) => void;
  onCategoryOverride?: (itemId: string, newSubcategory: string) => void;
}

type SortKey = "accountName" | "subcategory" | "currentAmount" | "changePercent";
type SortDir = "asc" | "desc";

export function ExpenseTable({ lineItems, subcategories, onDelete, onCategoryOverride }: ExpenseTableProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "recurring" | "anomaly">("all");
  const [sortKey, setSortKey] = useState<SortKey>("currentAmount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  // Filter and sort
  const filtered = useMemo(() => {
    let items = lineItems;

    // Search
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (i) => i.accountName.toLowerCase().includes(q) || i.subcategory.toLowerCase().includes(q),
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
      if (sortKey === "accountName") cmp = a.accountName.localeCompare(b.accountName);
      else if (sortKey === "subcategory") cmp = a.subcategory.localeCompare(b.subcategory);
      else if (sortKey === "currentAmount") cmp = a.currentAmount - b.currentAmount;
      else if (sortKey === "changePercent") cmp = a.changePercent - b.changePercent;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return items;
  }, [lineItems, search, categoryFilter, typeFilter, sortKey, sortDir]);

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

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

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
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="px-6 py-2 bg-brand-50 border-b border-brand-100 flex items-center gap-3 animate-slide-up">
          <span className="text-xs font-medium text-brand-700">
            {selected.size} selected
          </span>
          <button
            onClick={() => {/* bulk categorize placeholder */}}
            className="inline-flex items-center gap-1 rounded-md bg-brand-100 px-2.5 py-1 text-[10px] font-medium text-brand-700 hover:bg-brand-200 transition-colors"
          >
            <Tag className="h-3 w-3" /> Categorize
          </button>
          {onDelete && (
            <button
              onClick={() => { onDelete(Array.from(selected)); setSelected(new Set()); }}
              className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1 text-[10px] font-medium text-red-600 hover:bg-red-100 transition-colors"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
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
              <th className="w-10 px-4 py-3">
                <button onClick={toggleAll} className="flex items-center justify-center">
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
                className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase cursor-pointer select-none hover:text-surface-700 transition-colors"
                onClick={() => handleSort("accountName")}
              >
                <span className="inline-flex items-center gap-1">
                  Expense <SortIcon col="accountName" />
                </span>
              </th>
              <th
                className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase cursor-pointer select-none hover:text-surface-700 transition-colors"
                onClick={() => handleSort("subcategory")}
              >
                <span className="inline-flex items-center gap-1">
                  Category <SortIcon col="subcategory" />
                </span>
              </th>
              <th
                className="text-right px-4 py-3 text-xs font-medium text-surface-500 uppercase cursor-pointer select-none hover:text-surface-700 transition-colors"
                onClick={() => handleSort("currentAmount")}
              >
                <span className="inline-flex items-center gap-1 justify-end">
                  Monthly <SortIcon col="currentAmount" />
                </span>
              </th>
              <th
                className="text-right px-4 py-3 text-xs font-medium text-surface-500 uppercase cursor-pointer select-none hover:text-surface-700 transition-colors"
                onClick={() => handleSort("changePercent")}
              >
                <span className="inline-flex items-center gap-1 justify-end">
                  Trend <SortIcon col="changePercent" />
                </span>
              </th>
              <th className="text-center px-4 py-3 text-xs font-medium text-surface-500 uppercase">
                Flags
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
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
                const changeIcon = item.changePercent > 0.01 ? "\u2191" : item.changePercent < -0.01 ? "\u2193" : "\u2192";
                const changeColor = item.changePercent > 0.01 ? "text-red-600" : item.changePercent < -0.01 ? "text-green-600" : "text-surface-500";

                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-surface-50 transition-colors ${isSelected ? "bg-brand-50/50" : ""}`}
                  >
                    <td className="w-10 px-4 py-3">
                      <button onClick={() => toggleSelect(item.id)} className="flex items-center justify-center">
                        <div className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                          isSelected ? "bg-brand-600 border-brand-600" : "border-surface-300 hover:border-surface-400"
                        }`}>
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-sm font-medium text-surface-900">{item.accountName}</span>
                        <span className="ml-2 text-[10px] text-surface-400 uppercase">{item.method}</span>
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
                              // Learn: save merchant→category mapping
                              fetch("/api/merchant-mappings", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  description: item.accountName,
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
                            title={`AI categorized (${Math.round(item.subcategoryConfidence * 100)}% confidence)`}
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
                        {changeIcon} {Math.abs(item.changePercent * 100).toFixed(0)}%
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
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
