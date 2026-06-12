"use client";

import Link from "next/link";
import Image from "next/image";
import {
  Settings,
  Command,
  X,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  UserCheck,
  Zap,
  Brain,
  Activity,
  Pin,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { useCapabilities } from "@/components/providers/capability-context";
import { useAccountStatus } from "@/lib/use-account-status";
import { apiFetch } from "@/lib/api-fetch";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSensors } from "@dnd-kit/core";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

import type { NavItem, QuickAction, QuickActionMode, UserInfo } from "./nav-config";
import { SortableNavItem } from "./sortable-nav-item";

export interface SidebarInnerProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
  isMobile: boolean;
  orderedNavItems: NavItem[];
  navOrder: string[];
  pathname: string;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
  masterEnabled: boolean;
  chatEnabled: boolean;
  quickActionMode: QuickActionMode;
  onSetQuickActionMode: (mode: QuickActionMode) => void;
  quickActions: QuickAction[];
  quickActionModeOverrides: Record<string, QuickActionMode>;
  onSetQuickActionItemMode: (actionId: string, mode: QuickActionMode | null) => void;
  onOpenSearch: () => void;
  onToggleAI: () => void;
  user: UserInfo | null;
  dndContextId: string;
}

export function SidebarInner({
  collapsed,
  onToggleCollapse,
  onClose,
  isMobile,
  orderedNavItems,
  navOrder,
  pathname,
  sensors,
  onDragEnd,
  masterEnabled,
  chatEnabled: _chatEnabled,
  quickActionMode,
  onSetQuickActionMode: _onSetQuickActionMode,
  quickActions,
  quickActionModeOverrides,
  onSetQuickActionItemMode,
  onOpenSearch,
  onToggleAI: _onToggleAI,
  user,
  dndContextId,
}: SidebarInnerProps) {
  const modeIcons: Record<QuickActionMode, LucideIcon> = {
    intelligence: Brain,
    dynamic: Activity,
    custom: Pin,
  };

  const { autoLogin } = useCapabilities();
  const { status } = useAccountStatus();
  const localUnclaimed = autoLogin && status !== undefined && !status.isClaimed;

  const handleSignOut = async () => {
    if (autoLogin) {
      // claimed local user: suppress auto-login so the next visit shows /login
      await apiFetch("/api/auth/suppress-autologin", { method: "POST" }).catch(() => {});
    }
    void signOut({ callbackUrl: "/login" });
  };

  return (
    <>
      {/* Logo header */}
      <div className={`p-4 flex ${collapsed ? "flex-col items-center gap-2" : "items-center justify-between"}`}>
        <Link href="/dashboard" className="flex items-center gap-1 min-w-0">
          <BrandLogo className="h-8 w-8 flex-shrink-0" />
          {!collapsed && (
            <span className="text-lg font-semibold truncate bg-gradient-to-r from-blue-700 to-blue-400 bg-clip-text text-transparent">
              burnless
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
      <div className="px-3 mb-3">
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

      {/* TODO: Re-enable Quick Actions in next version */}

      {/* Divider */}
      <div className="px-4 mb-3">
        <div className="border-t border-surface-200/60" />
      </div>

      {/* Main nav — scrollable, drag-and-drop reorderable */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1" aria-label="Sidebar">
        <DndContext
          id={dndContextId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={navOrder} strategy={verticalListSortingStrategy}>
            {orderedNavItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href)) ||
                (item.id === "data-room" && (pathname.startsWith("/reports") || pathname.startsWith("/import")));
              return (
                <SortableNavItem
                  key={item.id}
                  item={item}
                  isActive={isActive}
                  href={item.href}
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
                {localUnclaimed ? (
                  <Link
                    href="/settings?tab=security"
                    className="rounded-lg p-1.5 text-surface-400 hover:bg-brand-50 hover:text-brand-600 transition-colors"
                    title="Claim account"
                    aria-label="Claim account"
                  >
                    <UserCheck className="h-4 w-4" />
                  </Link>
                ) : (
                  <button
                    onClick={handleSignOut}
                    className="rounded-lg p-1.5 text-surface-400 hover:bg-danger-50 hover:text-danger-600 transition-colors"
                    title="Sign out"
                    aria-label="Sign out"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {collapsed && (
          // SHELL-02: keep the theme toggle reachable in the collapsed rail. It's
          // already an icon-only, aria-labeled button, so it works centered here.
          <div className="mt-2 flex flex-col items-center gap-1">
            <ThemeToggle />
            {localUnclaimed ? (
              <Link
                href="/settings?tab=security"
                className="w-full flex justify-center rounded-lg p-1.5 text-surface-400 hover:bg-brand-50 hover:text-brand-600 transition-colors"
                title="Claim account"
                aria-label="Claim account"
              >
                <UserCheck className="h-4 w-4" />
              </Link>
            ) : (
              <button
                onClick={handleSignOut}
                className="w-full flex justify-center rounded-lg p-1.5 text-surface-400 hover:bg-danger-50 hover:text-danger-600 transition-colors"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
