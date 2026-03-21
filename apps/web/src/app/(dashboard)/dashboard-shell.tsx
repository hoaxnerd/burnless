"use client";

import Link from "next/link";
import Image from "next/image";
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
  LogOut,
  Zap,
  GripVertical,
  Brain,
  Activity,
  Pin,
  type LucideIcon,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { signOut } from "next-auth/react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BrandLogo } from "@/components/brand-logo";
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
import { useProactiveAlerts } from "@/components/ai/use-proactive-alerts";

/* ── Nav item definitions ─────────────────────────────────────────────────── */

interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
}

const coreNavItems: NavItem[] = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "expenses", href: "/expenses", label: "Expenses", icon: Receipt },
  { id: "revenue", href: "/revenue", label: "Revenue", icon: TrendingUp },
  { id: "funding", href: "/funding", label: "Funding", icon: Landmark },
  { id: "team", href: "/team", label: "Team", icon: Users },
  { id: "scenarios", href: "/scenarios", label: "Scenarios", icon: GitBranch },
  { id: "reports", href: "/reports", label: "Reports", icon: FileBarChart },
  { id: "import", href: "/import", label: "Import", icon: Upload },
  { id: "data-room", href: "/data-room", label: "Data Room", icon: FolderOpen },
];

const aiNavItem: NavItem = { id: "ai", href: "/ai", label: "AI Companion", icon: Sparkles };

const NAV_ITEM_MAP = new Map<string, NavItem>(
  [...coreNavItems, aiNavItem].map((item) => [item.id, item])
);

/* ── Quick Action mode types ──────────────────────────────────────────────── */

type QuickActionMode = "intelligence" | "dynamic" | "custom";

interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  action?: () => void;
}

/* ── User info ────────────────────────────────────────────────────────────── */

interface UserInfo {
  name: string | null;
  email: string | null;
  image: string | null;
}

/* ── SortableNavItem ──────────────────────────────────────────────────────── */

function SortableNavItem({
  item,
  isActive,
  href,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  href: string;
  collapsed: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = item.icon;

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <Link
        href={href}
        className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
          isActive
            ? "bg-brand-50 text-brand-700 shadow-sm"
            : "text-surface-600 hover:bg-surface-50 hover:text-surface-900"
        } ${collapsed ? "justify-center px-2" : ""}`}
        aria-current={isActive ? "page" : undefined}
        title={collapsed ? item.label : undefined}
      >
        <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-brand-600" : "text-surface-400"}`} />
        {!collapsed && <span className="flex-1">{item.label}</span>}
      </Link>
      {/* Drag handle — only visible on hover, only when expanded */}
      {!collapsed && (
        <button
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-100 text-surface-300 hover:text-surface-500 transition-all cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${item.label}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ── DashboardShell (outer providers) ─────────────────────────────────────── */

export function DashboardShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: UserInfo | null;
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
        user={user}
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

/* ── DashboardContent ─────────────────────────────────────────────────────── */

function DashboardContent({
  children,
  aiPanelOpen,
  setAiPanelOpen,
  commandPaletteOpen,
  setCommandPaletteOpen,
  user,
}: {
  children: React.ReactNode;
  aiPanelOpen: boolean;
  setAiPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
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

  // Nav item ordering — users can reorder via drag-and-drop
  const defaultOrder = useMemo(() => {
    const items = masterEnabled
      ? [...coreNavItems, aiNavItem]
      : coreNavItems;
    return items.map((i) => i.id);
  }, [masterEnabled]);

  const [navOrder, setNavOrder] = useState<string[]>(defaultOrder);

  // Load preferences from API on mount
  useEffect(() => {
    fetch("/api/user-preferences")
      .then((r) => r.ok ? r.json() : null)
      .then((prefs) => {
        if (prefs?.sidebarOrder?.length) setNavOrder(prefs.sidebarOrder);
        if (prefs?.quickActionMode) setQuickActionMode(prefs.quickActionMode);
        if (prefs?.sidebarCollapsed != null) setSidebarCollapsed(prefs.sidebarCollapsed);
      })
      .catch(() => {}); // silently fail — use defaults
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist preferences on change
  const persistPreferences = useCallback((updates: Record<string, unknown>) => {
    fetch("/api/user-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }).catch(() => {}); // fire-and-forget
  }, []);

  // Proactive financial alerts
  useProactiveAlerts();

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileOpen(false); // eslint-disable-line react-hooks/set-state-in-effect
  }, [pathname]);

  // Sync nav order when masterEnabled changes
  useEffect(() => {
    setNavOrder((prev: string[]) => {
      const hasAi = prev.includes("ai");
      if (masterEnabled && !hasAi) {
        const first = prev[0] ?? "dashboard";
        return [first, "ai", ...prev.slice(1)];
      }
      if (!masterEnabled && hasAi) {
        return prev.filter((id): id is string => id !== "ai");
      }
      return prev;
    });
  }, [masterEnabled]);

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

  // Quick actions (dynamic mode — context-aware suggestions)
  const quickActions = useMemo((): QuickAction[] => {
    if (quickActionMode === "intelligence" && masterEnabled) {
      return [
        { id: "qa-ai-review", label: "Review financials", icon: Sparkles, href: "/dashboard" },
        { id: "qa-ai-forecast", label: "Update forecast", icon: Activity, href: "/scenarios" },
      ];
    }
    if (quickActionMode === "dynamic") {
      return [
        { id: "qa-add-expense", label: "Add expense", icon: Receipt, href: "/expenses" },
        { id: "qa-new-scenario", label: "New scenario", icon: GitBranch, href: "/scenarios/new" },
        { id: "qa-import", label: "Import data", icon: Upload, href: "/import" },
      ];
    }
    return [
      { id: "qa-dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
    ];
  }, [quickActionMode, masterEnabled]);

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
        <div className={`flex-shrink-0 transition-all duration-300 ${sidebarCollapsed ? "w-[calc(4rem+1rem)]" : "w-[calc(16rem+1rem)]"} hidden lg:block`}>
          <aside
            className={`
              ${sidebarWidth} bg-surface-0 flex flex-col flex-shrink-0 transition-all duration-300
              m-2 rounded-2xl shadow-lg border border-surface-200/60 h-[calc(100vh-1rem)]
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
              onOpenSearch={() => setCommandPaletteOpen(true)}
              onToggleAI={() => setAiPanelOpen(true)}
              user={user}
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
            onOpenSearch={() => setCommandPaletteOpen(true)}
            onToggleAI={() => setAiPanelOpen(true)}
            user={user}
          />
        </aside>

        {/* Main content — only this scrolls */}
        <main className="flex-1 overflow-auto bg-surface-50" id="main-content" role="main">
          <div key={pathname} className="p-4 sm:p-6 lg:p-8 animate-page-enter">
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

/* ── SidebarInner (shared between desktop + mobile) ───────────────────────── */

function SidebarInner({
  collapsed,
  onToggleCollapse,
  onClose,
  isMobile,
  orderedNavItems,
  navOrder,
  buildHref,
  pathname,
  sensors,
  onDragEnd,
  masterEnabled,
  chatEnabled,
  quickActionMode,
  onSetQuickActionMode,
  quickActions,
  onOpenSearch,
  onToggleAI,
  user,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
  isMobile: boolean;
  orderedNavItems: NavItem[];
  navOrder: string[];
  buildHref: (base: string) => string;
  pathname: string;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
  masterEnabled: boolean;
  chatEnabled: boolean;
  quickActionMode: QuickActionMode;
  onSetQuickActionMode: (mode: QuickActionMode) => void;
  quickActions: QuickAction[];
  onOpenSearch: () => void;
  onToggleAI: () => void;
  user: UserInfo | null;
}) {
  const modeIcons: Record<QuickActionMode, LucideIcon> = {
    intelligence: Brain,
    dynamic: Activity,
    custom: Pin,
  };

  return (
    <>
      {/* Logo header */}
      <div className="p-4 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
          <BrandLogo className="h-8 w-8 flex-shrink-0" />
          {!collapsed && (
            <span className="text-lg font-semibold text-surface-900 truncate">
              Burnless
            </span>
          )}
        </Link>
        {isMobile ? (
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 transition-colors"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={onToggleCollapse}
            className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Search trigger — prominent at top */}
      <div className="px-3 mb-1">
        <button
          onClick={onOpenSearch}
          className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all
            bg-surface-50 border border-surface-200/80 hover:border-surface-300 hover:bg-surface-100
            text-surface-400 hover:text-surface-600
            ${collapsed ? "justify-center px-2" : ""}
          `}
          title={collapsed ? "Search (⌘K)" : undefined}
        >
          <Command className="h-4 w-4 flex-shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left text-surface-400">Search...</span>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-surface-200 bg-white dark:bg-surface-100 px-1.5 py-0.5 text-[10px] font-mono text-surface-400">
                <span className="text-xs">&#8984;</span>K
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Quick Actions */}
      {!collapsed && (
        <div className="px-3 mb-1">
          <div className="flex items-center justify-between px-1 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-400">
              Quick Actions
            </span>
            <div className="flex items-center gap-0.5">
              {(["intelligence", "dynamic", "custom"] as QuickActionMode[]).map((mode) => {
                const ModeIcon = modeIcons[mode];
                const isActiveMode = quickActionMode === mode;
                const isDisabled = mode === "intelligence" && !masterEnabled;
                return (
                  <button
                    key={mode}
                    onClick={() => !isDisabled && onSetQuickActionMode(mode)}
                    disabled={isDisabled}
                    className={`p-1 rounded-md transition-colors ${
                      isActiveMode
                        ? "bg-brand-50 text-brand-600"
                        : isDisabled
                        ? "text-surface-200 cursor-not-allowed"
                        : "text-surface-300 hover:text-surface-500 hover:bg-surface-50"
                    }`}
                    title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} mode${isDisabled ? " (requires AI)" : ""}`}
                  >
                    <ModeIcon className="h-3 w-3" />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-0.5">
            {quickActions.map((qa) => (
              qa.href ? (
                <Link
                  key={qa.id}
                  href={qa.href}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium text-surface-500 hover:bg-surface-50 hover:text-surface-700 transition-colors"
                >
                  <Zap className="h-3 w-3 text-warning-500" />
                  <span>{qa.label}</span>
                </Link>
              ) : (
                <button
                  key={qa.id}
                  onClick={qa.action}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium text-surface-500 hover:bg-surface-50 hover:text-surface-700 transition-colors"
                >
                  <Zap className="h-3 w-3 text-warning-500" />
                  <span>{qa.label}</span>
                </button>
              )
            ))}
          </div>
        </div>
      )}

      {/* AI Companion — prominent card */}
      {masterEnabled && chatEnabled && (
        <div className="px-3 mb-2">
          <button
            onClick={onToggleAI}
            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all
              bg-gradient-to-r from-brand-50 to-purple-50 dark:from-brand-950/30 dark:to-purple-950/30
              border border-brand-200/50 dark:border-brand-800/30
              text-brand-700 dark:text-brand-300
              hover:shadow-md hover:border-brand-300/70 dark:hover:border-brand-700/50
              ${collapsed ? "justify-center px-2" : ""}
            `}
            title={collapsed ? "AI Companion" : undefined}
          >
            <Sparkles className="h-4 w-4 flex-shrink-0 text-brand-500" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">AI Companion</span>
                <span className="text-[10px] font-normal text-brand-400 bg-brand-100 dark:bg-brand-900/40 px-1.5 py-0.5 rounded-full">
                  Ask
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Divider */}
      <div className="px-4 mb-1">
        <div className="border-t border-surface-200/60" />
      </div>

      {/* Main nav — scrollable, drag-and-drop reorderable */}
      <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-0.5" aria-label="Sidebar">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={navOrder} strategy={verticalListSortingStrategy}>
            {orderedNavItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <SortableNavItem
                  key={item.id}
                  item={item}
                  isActive={isActive}
                  href={buildHref(item.href)}
                  collapsed={collapsed}
                />
              );
            })}
          </SortableContext>
        </DndContext>
      </nav>

      {/* Bottom section — Settings */}
      <div className="px-3 pb-1">
        <Link
          href="/settings"
          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
            pathname === "/settings"
              ? "bg-brand-50 text-brand-700 shadow-sm"
              : "text-surface-600 hover:bg-surface-50 hover:text-surface-900"
          } ${collapsed ? "justify-center px-2" : ""}`}
          aria-current={pathname === "/settings" ? "page" : undefined}
          title={collapsed ? "Settings" : undefined}
        >
          <Settings className={`h-4 w-4 flex-shrink-0 ${pathname === "/settings" ? "text-brand-600" : "text-surface-400"}`} />
          {!collapsed && "Settings"}
        </Link>
      </div>

      {/* User profile + logout */}
      <div className="p-3 border-t border-surface-200/60">
        <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
          {user?.image ? (
            <Image
              src={user.image}
              alt=""
              width={32}
              height={32}
              className="rounded-full flex-shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-surface-200 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-medium text-surface-600">
                {(user?.name ?? user?.email ?? "U").charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-surface-900 truncate">
                  {user?.name ?? "User"}
                </p>
                <p className="text-xs text-surface-500 truncate">
                  {user?.email ?? ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <ThemeToggle />
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="rounded-lg p-1.5 text-surface-400 hover:bg-danger-50 hover:text-danger-600 transition-colors"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
        {collapsed && (
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="mt-2 w-full flex justify-center rounded-lg p-1.5 text-surface-400 hover:bg-danger-50 hover:text-danger-600 transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </>
  );
}
