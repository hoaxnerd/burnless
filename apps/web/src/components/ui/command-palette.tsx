"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOptionalAiFlags } from "@/components/ai/ai-feature-context";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  TrendingUp,
  Landmark,
  Users,
  GitBranch,
  FileBarChart,
  Upload,
  FolderOpen,
  Settings,
  Sparkles,
  Search,
  ArrowRight,
  Clock,
  type LucideIcon,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  href?: string;
  action?: () => void;
  keywords?: string[];
  section: string;
  category: "page" | "action" | "data" | "ai";
}

type CategoryFilter = "all" | "page" | "action" | "data" | "ai";

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: "All",
  page: "Pages",
  action: "Actions",
  data: "Data",
  ai: "AI",
};

const RECENT_SEARCHES_KEY = "burnless:recent-searches";
const MAX_RECENT = 5;

const SUGGESTED_QUERIES = [
  "How much runway do we have?",
  "Show monthly burn rate",
  "Compare scenarios",
  "Export financial report",
];

/* ── Commands registry ─────────────────────────────────────────────────────── */

function buildCommands(onToggleAI?: () => void, companionName = "Companion"): CommandItem[] {
  return [
    // Pages
    { id: "nav-dashboard", label: "Dashboard", description: "Financial overview & KPIs", icon: LayoutDashboard, href: "/dashboard", keywords: ["home", "overview", "kpi"], section: "Pages", category: "page" },
    { id: "nav-expenses", label: "Expenses", description: "Track spending & burn", icon: Receipt, href: "/expenses", keywords: ["costs", "spending", "burn"], section: "Pages", category: "page" },
    { id: "nav-revenue", label: "Revenue", description: "Revenue streams & MRR", icon: TrendingUp, href: "/revenue", keywords: ["mrr", "arr", "income", "sales"], section: "Pages", category: "page" },
    { id: "nav-funding", label: "Funding", description: "Rounds & cap table", icon: Landmark, href: "/funding", keywords: ["raise", "investors", "cap table", "dilution"], section: "Pages", category: "page" },
    { id: "nav-team", label: "Team", description: "Headcount & hiring plan", icon: Users, href: "/team", keywords: ["employees", "hiring", "org", "people"], section: "Pages", category: "page" },
    { id: "nav-scenarios", label: "Scenarios", description: "What-if modeling", icon: GitBranch, href: "/scenarios", keywords: ["what if", "model", "forecast"], section: "Pages", category: "page" },
    { id: "nav-reports", label: "Reports", description: "Financial statements", icon: FileBarChart, href: "/reports", keywords: ["p&l", "cash flow", "balance sheet", "runway"], section: "Pages", category: "page" },
    { id: "nav-data-room", label: "Data Room", description: "Investor-ready snapshots", icon: FolderOpen, href: "/data-room", keywords: ["investors", "board", "share"], section: "Pages", category: "page" },
    { id: "nav-import", label: "Import Data", description: "Upload CSV files", icon: Upload, href: "/import", keywords: ["csv", "upload", "data"], section: "Pages", category: "page" },
    { id: "nav-settings", label: "Settings", description: "App preferences", icon: Settings, href: "/settings", keywords: ["config", "preferences", "account"], section: "Pages", category: "page" },

    // Actions
    { id: "act-new-scenario", label: "New Scenario", description: "Create a scenario overlay", icon: GitBranch, href: "/scenarios", keywords: ["create", "new", "scenario", "overlay"], section: "Actions", category: "action" },
    { id: "act-import-csv", label: "Import CSV", description: "Upload expense data", icon: Upload, href: "/import", keywords: ["upload", "csv"], section: "Actions", category: "action" },
    { id: "act-generate-report", label: "Generate Report", description: "Create financial report", icon: FileBarChart, href: "/reports", keywords: ["report", "export", "pdf"], section: "Actions", category: "action" },

    // Data
    { id: "data-expenses", label: "Expense Data", description: "View all expense entries", icon: Receipt, href: "/expenses", keywords: ["costs", "entries"], section: "Data", category: "data" },
    { id: "data-revenue", label: "Revenue Data", description: "View revenue streams", icon: TrendingUp, href: "/revenue", keywords: ["income", "mrr"], section: "Data", category: "data" },

    // AI
    ...(onToggleAI
      ? [
          {
            id: "ai-open",
            label: `Ask ${companionName}`,
            description: `Open ${companionName}`,
            icon: Sparkles,
            action: onToggleAI,
            keywords: ["ai", "chat", "assistant", "help", "intelligence"],
            section: "AI",
            category: "ai" as const,
          } satisfies CommandItem,
        ]
      : []),
  ];
}

/* ── Recent searches helpers ───────────────────────────────────────────────── */

function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  if (typeof window === "undefined" || !query.trim()) return;
  try {
    const recent = getRecentSearches().filter((s) => s !== query);
    recent.unshift(query);
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT)),
    );
  } catch {
    // ignore storage errors
  }
}

function clearRecentSearches() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // ignore
  }
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export function CommandPalette({
  open,
  onClose,
  onToggleAI,
}: {
  open: boolean;
  onClose: () => void;
  onToggleAI?: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const aiFlags = useOptionalAiFlags();
  const companionName = aiFlags?.companionName ?? "Companion";

  const commands = useMemo(() => buildCommands(onToggleAI, companionName), [onToggleAI, companionName]);

  const filtered = useMemo(() => {
    let items = commands;

    // Apply category filter
    if (categoryFilter !== "all") {
      items = items.filter((cmd) => cmd.category === categoryFilter);
    }

    // Apply text search
    if (query.trim()) {
      const q = query.toLowerCase();
      items = items.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(q) ||
          cmd.description?.toLowerCase().includes(q) ||
          cmd.keywords?.some((k) => k.includes(q)),
      );
    }

    return items;
  }, [query, commands, categoryFilter]);

  // Group by section
  const sections = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      if (!map.has(item.section)) map.set(item.section, []);
      map.get(item.section)!.push(item);
    }
    return map;
  }, [filtered]);

  const flatItems = useMemo(() => filtered, [filtered]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setCategoryFilter("all");
      setRecentSearches(getRecentSearches());
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // Clamp active index when results change
  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(0, flatItems.length - 1)));
  }, [flatItems.length]);

  const execute = useCallback(
    (item: CommandItem) => {
      if (query.trim()) saveRecentSearch(query.trim());
      onClose();
      if (item.action) {
        item.action();
      } else if (item.href) {
        router.push(item.href);
      }
    },
    [onClose, router, query],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (flatItems[activeIndex]) execute(flatItems[activeIndex]);
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatItems, activeIndex, execute, onClose],
  );

  if (!open) return null;

  let itemIndex = -1;
  const showRecent = !query.trim() && categoryFilter === "all" && recentSearches.length > 0;
  const showSuggested = !query.trim() && categoryFilter === "all" && onToggleAI;

  // Available categories based on commands
  const availableCategories: CategoryFilter[] = ["all", "page", "action", "data"];
  if (onToggleAI) availableCategories.push("ai");

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] animate-fade-in"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[12vh] px-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-2xl shadow-xl overflow-hidden animate-scale-in"
          role="combobox"
          aria-expanded={true}
          aria-haspopup="listbox"
          aria-controls="command-palette-listbox"
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-surface-200 dark:border-surface-700">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 dark:bg-brand-950 flex-shrink-0">
              <Search className="h-4 w-4 text-brand-500" />
            </div>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search pages, actions, data..."
              className="flex-1 bg-transparent text-sm text-surface-900 dark:text-surface-50 placeholder:text-surface-400 outline-none"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              aria-label="Command palette search"
              aria-autocomplete="list"
            />
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-700 px-1.5 py-0.5 text-[10px] font-mono text-surface-400">
              ESC
            </kbd>
          </div>

          {/* Category filter tabs */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-surface-100 dark:border-surface-700/50 overflow-x-auto">
            {availableCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setCategoryFilter(cat);
                  setActiveIndex(0);
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  categoryFilter === cat
                    ? "bg-brand-600 text-white"
                    : "text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700"
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Results */}
          <div
            ref={listRef}
            className="max-h-80 overflow-y-auto py-2"
            role="listbox"
            id="command-palette-listbox"
          >
            {/* Recent searches */}
            {showRecent && (
              <div className="mb-1">
                <div className="flex items-center justify-between px-4 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-400">
                    Recent
                  </span>
                  <button
                    onClick={() => {
                      clearRecentSearches();
                      setRecentSearches([]);
                    }}
                    className="text-[10px] text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
                  >
                    Clear
                  </button>
                </div>
                {recentSearches.map((search) => (
                  <button
                    key={search}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
                    onClick={() => {
                      setQuery(search);
                      setActiveIndex(0);
                    }}
                  >
                    <Clock className="h-3.5 w-3.5 text-surface-400 flex-shrink-0" />
                    <span className="text-sm">{search}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Suggested AI queries */}
            {showSuggested && (
              <div className="mb-1">
                <div className="px-4 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-400">
                    Suggested
                  </span>
                </div>
                {SUGGESTED_QUERIES.map((suggestion) => (
                  <button
                    key={suggestion}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left text-surface-600 dark:text-surface-300 hover:bg-accent-50 dark:hover:bg-accent-950 transition-colors group"
                    onClick={() => {
                      onClose();
                      onToggleAI?.();
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-accent-400 flex-shrink-0" />
                    <span className="text-sm">{suggestion}</span>
                    <span className="ml-auto text-[10px] text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      Ask {companionName}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Command results */}
            {flatItems.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-surface-400">
                  No results for &ldquo;{query}&rdquo;
                </p>
                {onToggleAI && query.trim() && (
                  <button
                    onClick={() => {
                      saveRecentSearch(query.trim());
                      onClose();
                      onToggleAI();
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-accent-50 dark:bg-accent-950 text-accent-700 dark:text-accent-400 hover:bg-accent-100 dark:hover:bg-accent-900 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Ask {companionName} about &ldquo;{query}&rdquo;
                  </button>
                )}
              </div>
            ) : (
              Array.from(sections.entries()).map(([section, items]) => (
                <div key={section}>
                  <div className="px-4 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-400">
                      {section}
                    </span>
                  </div>
                  {items.map((item) => {
                    itemIndex++;
                    const isActive = itemIndex === activeIndex;
                    const Icon = item.icon;
                    const currentIndex = itemIndex;
                    const isAI = item.category === "ai";
                    return (
                      <button
                        key={item.id}
                        data-active={isActive}
                        role="option"
                        aria-selected={isActive}
                        className={`
                          w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                          ${isActive
                            ? isAI
                              ? "bg-accent-50 dark:bg-accent-950 text-accent-700 dark:text-accent-300"
                              : "bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300"
                            : "text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700/50"
                          }
                        `}
                        onClick={() => execute(item)}
                        onMouseEnter={() => setActiveIndex(currentIndex)}
                      >
                        <div
                          className={`flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 ${
                            isActive
                              ? isAI
                                ? "bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400"
                                : "bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400"
                              : "bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-400"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.label}</p>
                          {item.description && (
                            <p className="text-xs text-surface-400 dark:text-surface-500 truncate">
                              {item.description}
                            </p>
                          )}
                        </div>
                        {isActive && (
                          <ArrowRight
                            className={`h-3.5 w-3.5 ${
                              isAI ? "text-accent-400" : "text-brand-400"
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-900/30">
            <div className="flex items-center gap-3 text-[10px] text-surface-400">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-surface-200 dark:border-surface-600 px-1 py-0.5 font-mono">
                  ↑↓
                </kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-surface-200 dark:border-surface-600 px-1 py-0.5 font-mono">
                  ↵
                </kbd>
                select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-surface-200 dark:border-surface-600 px-1 py-0.5 font-mono">
                  esc
                </kbd>
                close
              </span>
            </div>
            {/* Use Intelligence button — always visible when AI available and there's a query */}
            {onToggleAI && query.trim() && (
              <button
                onClick={() => {
                  saveRecentSearch(query.trim());
                  onClose();
                  onToggleAI();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium
                  bg-gradient-to-r from-accent-50 to-brand-50 dark:from-accent-950/40 dark:to-brand-950/40
                  text-accent-700 dark:text-accent-400
                  border border-accent-200/50 dark:border-accent-800/30
                  hover:shadow-sm hover:border-accent-300/70 dark:hover:border-accent-700/50 transition-all"
              >
                <Sparkles className="h-3 w-3" />
                Use Intelligence
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
