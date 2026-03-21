"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
}

/* ── Commands registry ─────────────────────────────────────────────────────── */

function buildCommands(onToggleAI?: () => void): CommandItem[] {
  return [
    // Navigation
    { id: "nav-dashboard", label: "Dashboard", description: "Financial overview", icon: LayoutDashboard, href: "/dashboard", keywords: ["home", "overview", "kpi"], section: "Navigate" },
    { id: "nav-expenses", label: "Expenses", description: "Track spending", icon: Receipt, href: "/expenses", keywords: ["costs", "spending", "burn"], section: "Navigate" },
    { id: "nav-revenue", label: "Revenue", description: "Revenue streams & MRR", icon: TrendingUp, href: "/revenue", keywords: ["mrr", "arr", "income", "sales"], section: "Navigate" },
    { id: "nav-funding", label: "Funding", description: "Rounds & cap table", icon: Landmark, href: "/funding", keywords: ["raise", "investors", "cap table", "dilution"], section: "Navigate" },
    { id: "nav-team", label: "Team", description: "Headcount & hiring", icon: Users, href: "/team", keywords: ["employees", "hiring", "org", "people"], section: "Navigate" },
    { id: "nav-scenarios", label: "Scenarios", description: "What-if modeling", icon: GitBranch, href: "/scenarios", keywords: ["what if", "model", "forecast"], section: "Navigate" },
    { id: "nav-reports", label: "Reports", description: "Financial statements", icon: FileBarChart, href: "/reports", keywords: ["p&l", "cash flow", "balance sheet", "runway"], section: "Navigate" },
    { id: "nav-import", label: "Import Data", description: "Upload CSV files", icon: Upload, href: "/import", keywords: ["csv", "upload", "data"], section: "Navigate" },
    { id: "nav-data-room", label: "Data Room", description: "Investor-ready snapshots", icon: FolderOpen, href: "/data-room", keywords: ["investors", "board", "share"], section: "Navigate" },
    { id: "nav-settings", label: "Settings", description: "App preferences", icon: Settings, href: "/settings", keywords: ["config", "preferences", "account"], section: "Navigate" },

    // Actions
    { id: "act-new-scenario", label: "New Scenario", description: "Create a what-if scenario", icon: GitBranch, href: "/scenarios/new", keywords: ["create", "new", "what if"], section: "Actions" },
    { id: "act-import-csv", label: "Import CSV", description: "Upload expense data", icon: Upload, href: "/import", keywords: ["upload", "csv"], section: "Actions" },

    // AI
    ...(onToggleAI
      ? [
          {
            id: "ai-open",
            label: "Ask AI",
            description: "Open AI companion",
            icon: Sparkles,
            action: onToggleAI,
            keywords: ["ai", "chat", "assistant", "help"],
            section: "AI",
          } satisfies CommandItem,
        ]
      : []),
  ];
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

  const commands = useMemo(() => buildCommands(onToggleAI), [onToggleAI]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.description?.toLowerCase().includes(q) ||
        cmd.keywords?.some((k) => k.includes(q)),
    );
  }, [query, commands]);

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
      // Focus input after animation
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const execute = useCallback(
    (item: CommandItem) => {
      onClose();
      if (item.action) {
        item.action();
      } else if (item.href) {
        router.push(item.href);
      }
    },
    [onClose, router],
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

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] animate-fade-in"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg bg-surface-0 border border-surface-200 rounded-2xl shadow-xl overflow-hidden animate-scale-in"
          role="combobox"
          aria-expanded={true}
          aria-haspopup="listbox"
          aria-controls="command-palette-listbox"
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-200">
            <Search className="h-5 w-5 text-surface-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search pages, actions..."
              className="flex-1 bg-transparent text-sm text-surface-900 placeholder:text-surface-400 outline-none"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              aria-label="Command palette search"
              aria-autocomplete="list"
            />
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-surface-200 bg-surface-50 px-1.5 py-0.5 text-[10px] font-mono text-surface-400">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            className="max-h-80 overflow-y-auto py-2"
            role="listbox"
            id="command-palette-listbox"
          >
            {flatItems.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-surface-400">No results for &ldquo;{query}&rdquo;</p>
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
                    return (
                      <button
                        key={item.id}
                        data-active={isActive}
                        role="option"
                        aria-selected={isActive}
                        className={`
                          w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                          ${isActive ? "bg-brand-50 text-brand-700" : "text-surface-700 hover:bg-surface-50"}
                        `}
                        onClick={() => execute(item)}
                        onMouseEnter={() => setActiveIndex(currentIndex)}
                      >
                        <Icon
                          className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-brand-500" : "text-surface-400"}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.label}</p>
                          {item.description && (
                            <p className="text-xs text-surface-400 truncate">{item.description}</p>
                          )}
                        </div>
                        {isActive && <ArrowRight className="h-3.5 w-3.5 text-brand-400" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-surface-200 bg-surface-50/50">
            <div className="flex items-center gap-3 text-[10px] text-surface-400">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-surface-200 px-1 py-0.5 font-mono">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-surface-200 px-1 py-0.5 font-mono">↵</kbd>
                select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-surface-200 px-1 py-0.5 font-mono">esc</kbd>
                close
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
