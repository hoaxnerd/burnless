"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  TrendingUp,
  Landmark,
  Users,
  GitBranch,
  FileBarChart,
  Sparkles,
  Settings,
  Command,
  FolderOpen,
  Upload,
  Menu,
  X,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { AiPanel } from "@/components/ai/ai-panel";
import { AiFeatureProvider, useAiFlags } from "@/components/ai/ai-feature-context";
import { ScenarioProvider } from "@/components/scenarios/scenario-context";
import { ScenarioBanner } from "@/components/scenarios/scenario-banner";
import { ThemeProvider, ThemeToggle } from "@/components/ui/theme-toggle";
import { KeyboardShortcutsProvider } from "@/components/ui/keyboard-shortcuts";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ToastProvider } from "@/components/ui/toast";
import { CommandPalette } from "@/components/ui/command-palette";
import { LocaleProvider } from "@/components/locale/locale-context";

const coreNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/revenue", label: "Revenue", icon: TrendingUp },
  { href: "/funding", label: "Funding", icon: Landmark },
  { href: "/team", label: "Team", icon: Users },
  { href: "/scenarios", label: "Scenarios", icon: GitBranch },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/data-room", label: "Data Room", icon: FolderOpen },
];

const aiNavItem = { href: "/ai", label: "AI Companion", icon: Sparkles };

const bottomNavItems = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setCommandPaletteOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const toggleAI = useCallback(() => setAiPanelOpen((prev) => !prev), []);

  return (
    <ThemeProvider>
    <ToastProvider>
    <LocaleProvider>
    <AiFeatureProvider>
    <KeyboardShortcutsProvider onToggleAI={toggleAI}>
    <ScenarioProvider>
      <DashboardContent
        aiPanelOpen={aiPanelOpen}
        setAiPanelOpen={setAiPanelOpen}
        commandPaletteOpen={commandPaletteOpen}
        setCommandPaletteOpen={setCommandPaletteOpen}
      >
        {children}
      </DashboardContent>
    </ScenarioProvider>
    </KeyboardShortcutsProvider>
    </AiFeatureProvider>
    </LocaleProvider>
    </ToastProvider>
    </ThemeProvider>
  );
}

/** Inner component that can use useAiFlags since it sits within AiFeatureProvider. */
function DashboardContent({
  children,
  aiPanelOpen,
  setAiPanelOpen,
  commandPaletteOpen,
  setCommandPaletteOpen,
}: {
  children: React.ReactNode;
  aiPanelOpen: boolean;
  setAiPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { masterEnabled, getFeature } = useAiFlags();
  const chatEnabled = getFeature("chat").enabled;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const scenarioId = searchParams.get("scenarioId");
  const buildHref = (base: string) =>
    scenarioId ? `${base}?scenarioId=${scenarioId}` : base;

  const allNavItems = masterEnabled
    ? [...coreNavItems, aiNavItem]
    : coreNavItems;

  const sidebarWidth = sidebarCollapsed ? "w-16" : "w-64";

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioBanner />

      {/* Mobile header */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-surface-200 bg-surface-0">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-surface-600 hover:bg-surface-100 transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-brand-600 flex items-center justify-center">
            <span className="text-white font-bold text-xs">B</span>
          </div>
          <span className="text-base font-semibold text-surface-900">Burnless</span>
        </Link>
        <div className="w-9" /> {/* Spacer for centering */}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex-1 flex">
        {/* Sidebar — desktop: collapsible, mobile: overlay */}
        <aside
          className={`
            ${sidebarWidth} border-r border-surface-200 bg-surface-0 flex flex-col flex-shrink-0 transition-all duration-300
            fixed lg:relative inset-y-0 left-0 z-50
            ${mobileOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0"}
          `}
          role="navigation"
          aria-label="Main navigation"
        >
          <div className="p-4 border-b border-surface-200 flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">B</span>
              </div>
              {!sidebarCollapsed && (
                <span className="text-lg font-semibold text-surface-900 truncate">
                  Burnless
                </span>
              )}
            </Link>
            {/* Mobile close */}
            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 transition-colors"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            {/* Desktop collapse toggle */}
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="hidden lg:flex rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? (
                <PanelLeft className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>

          <nav className="flex-1 p-3 space-y-1" aria-label="Sidebar">
            {allNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={buildHref(item.href)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-brand-50 text-brand-700 shadow-sm"
                      : "text-surface-600 hover:bg-surface-50 hover:text-surface-900"
                  } ${sidebarCollapsed ? "justify-center px-2" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-brand-600" : "text-surface-400"}`} />
                  {!sidebarCollapsed && item.label}
                </Link>
              );
            })}
          </nav>

          <div className="px-3 pb-2 space-y-1">
            {/* Command palette trigger */}
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-surface-500 hover:bg-surface-50 hover:text-surface-900 transition-colors ${sidebarCollapsed ? "justify-center px-2" : ""}`}
              title={sidebarCollapsed ? "Search (⌘K)" : undefined}
            >
              <Command className="h-4 w-4 text-surface-400 flex-shrink-0" />
              {!sidebarCollapsed && (
                <>
                  <span className="flex-1 text-left">Search</span>
                  <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-surface-200 bg-surface-50 px-1.5 py-0.5 text-[10px] font-mono text-surface-400">
                    <span className="text-xs">&#8984;</span>K
                  </kbd>
                </>
              )}
            </button>

            {bottomNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={buildHref(item.href)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-brand-50 text-brand-700 shadow-sm"
                      : "text-surface-600 hover:bg-surface-50 hover:text-surface-900"
                  } ${sidebarCollapsed ? "justify-center px-2" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-brand-600" : "text-surface-400"}`} />
                  {!sidebarCollapsed && item.label}
                </Link>
              );
            })}
          </div>

          <div className="p-4 border-t border-surface-200">
            <div className={`flex items-center gap-3 ${sidebarCollapsed ? "justify-center" : ""}`}>
              <div className="h-8 w-8 rounded-full bg-surface-200 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-medium text-surface-600">U</span>
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900 truncate">
                    User
                  </p>
                  <p className="text-xs text-surface-500 truncate">
                    user@startup.com
                  </p>
                </div>
              )}
              {!sidebarCollapsed && <ThemeToggle />}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 bg-surface-50 overflow-auto" id="main-content" role="main">
          <div className="p-4 sm:p-6 lg:p-8">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>
        </main>

        {/* Command Palette (Cmd+K) */}
        <CommandPalette
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          onToggleAI={chatEnabled ? () => setAiPanelOpen(true) : undefined}
        />

        {/* Global AI Panel */}
        {chatEnabled && (
          <AiPanel open={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
        )}
      </div>
    </div>
  );
}
