"use client";

import Link from "next/link";
import { apiFetch } from "@/lib/api-fetch";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Receipt,
  Upload,
  Menu,
  Activity,
  GitBranch,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { BrandLogo } from "@/components/brand-logo";

import { AiFeatureProvider, useAiFlags } from "@/components/ai/ai-feature-context";
import { ScenarioProvider } from "@/components/scenarios/scenario-context";
import { ScenarioBanner } from "@/components/scenarios/scenario-banner";
import { ThemeProvider } from "@/components/ui/theme-toggle";
import { KeyboardShortcutsProvider } from "@/components/ui/keyboard-shortcuts";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ToastProvider } from "@/components/ui/toast";
import { CommandPalette } from "@/components/ui/command-palette";
import { LocaleProvider } from "@/components/locale/locale-context";
import { useProactiveAlerts } from "@/components/ai/use-proactive-alerts";
import { MetricsProvider } from "@/components/providers/metrics-context";
import { InitialLayoutsProvider } from "@/components/providers/initial-layouts-context";
import { SWRProvider } from "@/lib/swr/provider";
import { SharedFormulaViewer } from "@/components/ui/shared-formula-viewer";

import {
  coreNavItems,
  aiNavItem,
  NAV_ITEM_MAP,
  type NavItem,
  type QuickAction,
  type QuickActionMode,
  type UserInfo,
} from "./nav-config";
import { SidebarInner } from "./sidebar-inner";

/* ── DashboardShell (outer providers) ─────────────────────────────────────── */

export function DashboardShell({
  children,
  user,
  initialSlotOverrides,
  initialPageLayouts,
}: {
  children: React.ReactNode;
  user: UserInfo | null;
  initialSlotOverrides?: Record<string, unknown> | null;
  initialPageLayouts?: Record<string, unknown> | null;
}) {
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

  // Navigate to AI page when AI is requested (replaces panel behavior)
  const navigateToAi = useCallback(() => {
    window.location.href = "/ai";
  }, []);

  // Listen for custom event from child components (e.g. AiCommandCenter)
  useEffect(() => {
    window.addEventListener("burnless:open-ai-panel", navigateToAi);
    return () => window.removeEventListener("burnless:open-ai-panel", navigateToAi);
  }, [navigateToAi]);

  return (
    <ThemeProvider>
    <SWRProvider>
    <ToastProvider>
    <LocaleProvider>
    <AiFeatureProvider>
    <KeyboardShortcutsProvider onToggleAI={navigateToAi}>
    <ScenarioProvider>
    <InitialLayoutsProvider layouts={(initialPageLayouts ?? {}) as Record<string, { layout: never[]; closedWidgets?: string[] }>}>
    <MetricsProvider initialSlotOverrides={initialSlotOverrides as Record<string, import("@burnless/engine").CardContent> | null | undefined}>
      <DashboardContent
        commandPaletteOpen={commandPaletteOpen}
        setCommandPaletteOpen={setCommandPaletteOpen}
        navigateToAi={navigateToAi}
        user={user}
      >
        {children}
      </DashboardContent>
    </MetricsProvider>
    </InitialLayoutsProvider>
    </ScenarioProvider>
    </KeyboardShortcutsProvider>
    </AiFeatureProvider>
    </LocaleProvider>
    </ToastProvider>
    </SWRProvider>
    </ThemeProvider>
  );
}

/* ── DashboardContent ─────────────────────────────────────────────────────── */

function DashboardContent({
  children,
  commandPaletteOpen,
  setCommandPaletteOpen,
  navigateToAi,
  user,
}: {
  children: React.ReactNode;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  navigateToAi: () => void;
  user: UserInfo | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { masterEnabled, getFeature } = useAiFlags();
  const chatEnabled = getFeature("chat").enabled;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickActionMode, setQuickActionMode] = useState<QuickActionMode>(
    masterEnabled ? "intelligence" : "dynamic"
  );
  // Per-quick-action mode overrides
  const [quickActionModeOverrides, setQuickActionModeOverrides] = useState<
    Record<string, QuickActionMode>
  >({});

  // Nav item ordering — users can reorder via drag-and-drop
  const defaultOrder = useMemo(() => {
    const items = masterEnabled
      ? [aiNavItem, ...coreNavItems]
      : coreNavItems;
    return items.map((i) => i.id);
  }, [masterEnabled]);

  const [navOrder, setNavOrder] = useState<string[]>(defaultOrder);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Load preferences from API on mount
  useEffect(() => {
    apiFetch("/api/user-preferences")
      .then((r) => r.ok ? r.json() : null)
      .then((prefs) => {
        if (prefs?.sidebarOrder?.length) setNavOrder(prefs.sidebarOrder);
        if (prefs?.quickActionMode) setQuickActionMode(prefs.quickActionMode);
        if (prefs?.quickActionModeOverrides) setQuickActionModeOverrides(prefs.quickActionModeOverrides);
        if (prefs?.sidebarCollapsed != null) setSidebarCollapsed(prefs.sidebarCollapsed);
      })
      .catch(() => {}) // silently fail — use defaults
      .finally(() => setPrefsLoaded(true));
  }, []);

  // Persist preferences on change
  const persistPreferences = useCallback((updates: Record<string, unknown>) => {
    apiFetch("/api/user-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }).catch(() => {}); // fire-and-forget
  }, []);

  // Proactive financial alerts
  useProactiveAlerts();

  // Close mobile sidebar on navigation
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Sync nav order when masterEnabled changes — only after prefs loaded
  // to avoid cascading re-renders (default → AI sync → prefs overwrite)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!prefsLoaded) return;
    setNavOrder((prev: string[]) => {
      const hasAi = prev.includes("ai");
      if (masterEnabled && !hasAi) {
        return ["ai", ...prev];
      }
      if (!masterEnabled && hasAi) {
        return prev.filter((id): id is string => id !== "ai");
      }
      return prev;
    });
  }, [masterEnabled, prefsLoaded]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const scenarioId = searchParams.get("scenarioId");
  const buildHref = (base: string) =>
    scenarioId ? `${base}?scenarioId=${scenarioId}` : base;

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setNavOrder((items) => {
      const oldIndex = items.indexOf(active.id as string);
      const newIndex = items.indexOf(over.id as string);
      const reordered = arrayMove(items, oldIndex, newIndex);
      persistPreferences({ sidebarOrder: reordered });
      return reordered;
    });
  }, [persistPreferences]);

  // Resolve ordered nav items
  const orderedNavItems = useMemo(() => {
    return navOrder
      .map((id) => NAV_ITEM_MAP.get(id))
      .filter((item): item is NavItem => !!item);
  }, [navOrder]);

  // Quick actions — merged list with per-item mode support
  const quickActions = useMemo((): QuickAction[] => {
    const actions: QuickAction[] = [
      { id: "qa-add-expense", label: "Add expense", icon: Receipt, href: "/expenses" },
      { id: "qa-new-scenario", label: "New scenario", icon: GitBranch, href: "/scenarios/new" },
      { id: "qa-import", label: "Import data", icon: Upload, href: "/data-room?tab=import" },
    ];
    if (masterEnabled) {
      actions.unshift(
        { id: "qa-ai-review", label: "Review financials", icon: BarChart3, href: "/dashboard" },
        { id: "qa-ai-forecast", label: "Update forecast", icon: Activity, href: "/scenarios" },
      );
    }
    return actions;
  }, [masterEnabled]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      persistPreferences({ sidebarCollapsed: next });
      return next;
    });
  }, [persistPreferences]);

  const handleSetQuickActionMode = useCallback((mode: QuickActionMode) => {
    setQuickActionMode(mode);
    persistPreferences({ quickActionMode: mode });
  }, [persistPreferences]);

  const handleSetQuickActionItemMode = useCallback((actionId: string, mode: QuickActionMode | null) => {
    setQuickActionModeOverrides((prev) => {
      const next = { ...prev };
      if (mode === null) {
        delete next[actionId];
      } else {
        next[actionId] = mode;
      }
      persistPreferences({ quickActionModeOverrides: next });
      return next;
    });
  }, [persistPreferences]);

  const sidebarWidth = sidebarCollapsed ? "w-16" : "w-64";

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface-100">
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
          <BrandLogo className="h-7 w-7" />
          <span className="text-base font-semibold text-surface-900">Burnless</span>
        </Link>
        <div className="w-9" />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Floating Sidebar — desktop */}
        <div className={`flex-shrink-0 transition-all duration-300 ${sidebarCollapsed ? "w-[calc(4rem+1.5rem)]" : "w-[calc(16rem+1.5rem)]"} hidden lg:block`}>
          <aside
            className={`
              ${sidebarWidth} bg-surface-0 flex flex-col flex-shrink-0 transition-all duration-300
              m-3 rounded-2xl shadow-lg border border-surface-200/60 h-[calc(100vh-1.5rem)]
              hidden lg:flex
            `}
            role="navigation"
            aria-label="Main navigation"
          >
            <SidebarInner
              collapsed={sidebarCollapsed}
              onToggleCollapse={handleToggleSidebar}
              onClose={() => setMobileOpen(false)}
              isMobile={false}
              orderedNavItems={orderedNavItems}
              navOrder={navOrder}
              buildHref={buildHref}
              pathname={pathname}
              sensors={sensors}
              onDragEnd={handleDragEnd}
              masterEnabled={masterEnabled}
              chatEnabled={chatEnabled}
              quickActionMode={quickActionMode}
              onSetQuickActionMode={handleSetQuickActionMode}
              quickActions={quickActions}
              quickActionModeOverrides={quickActionModeOverrides}
              onSetQuickActionItemMode={handleSetQuickActionItemMode}
              onOpenSearch={() => setCommandPaletteOpen(true)}
              onToggleAI={navigateToAi}
              user={user}
              dndContextId="sidebar-dnd-desktop"
            />
          </aside>
        </div>

        {/* Mobile sidebar — overlay */}
        <aside
          className={`
            w-64 bg-surface-0 flex flex-col flex-shrink-0
            fixed inset-y-0 left-0 z-50
            rounded-r-2xl shadow-2xl border-r border-surface-200/60
            lg:hidden transition-transform duration-300
            ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          `}
          role="navigation"
          aria-label="Main navigation"
        >
          <SidebarInner
            collapsed={false}
            onToggleCollapse={handleToggleSidebar}
            onClose={() => setMobileOpen(false)}
            isMobile={true}
            orderedNavItems={orderedNavItems}
            navOrder={navOrder}
            buildHref={buildHref}
            pathname={pathname}
            sensors={sensors}
            onDragEnd={handleDragEnd}
            masterEnabled={masterEnabled}
            chatEnabled={chatEnabled}
            quickActionMode={quickActionMode}
            onSetQuickActionMode={handleSetQuickActionMode}
            quickActions={quickActions}
            quickActionModeOverrides={quickActionModeOverrides}
            onSetQuickActionItemMode={handleSetQuickActionItemMode}
            onOpenSearch={() => setCommandPaletteOpen(true)}
            onToggleAI={navigateToAi}
            user={user}
            dndContextId="sidebar-dnd-mobile"
          />
        </aside>

        {/* Main content — floats on desktop to match sidebar, full-bleed on mobile */}
        <main
          className="flex-1 overflow-auto bg-surface-50 lg:my-3 lg:mr-3 lg:rounded-2xl lg:border lg:border-surface-200/60 lg:shadow-sm"
          id="main-content"
          role="main"
        >
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
          onToggleAI={chatEnabled ? navigateToAi : undefined}
        />

        {/* Shared Formula Viewer — available on all pages */}
        <SharedFormulaViewer />
      </div>
    </div>
  );
}
