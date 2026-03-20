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
} from "lucide-react";
import { Suspense, useState, useEffect, useCallback } from "react";
import { AiPanel } from "@/components/ai/ai-panel";
import { ScenarioProvider } from "@/components/scenarios/scenario-context";
import { ScenarioBanner } from "@/components/scenarios/scenario-banner";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/revenue", label: "Revenue", icon: TrendingUp },
  { href: "/funding", label: "Funding", icon: Landmark },
  { href: "/team", label: "Team", icon: Users },
  { href: "/scenarios", label: "Scenarios", icon: GitBranch },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/data-room", label: "Data Room", icon: FolderOpen },
  { href: "/ai", label: "AI Companion", icon: Sparkles },
];

const bottomNavItems = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  // Preserve scenarioId across nav links when in scenario mode
  const scenarioId = searchParams.get("scenarioId");
  const buildHref = (base: string) =>
    scenarioId ? `${base}?scenarioId=${scenarioId}` : base;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setAiPanelOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <Suspense fallback={null}>
    <ScenarioProvider>
    <div className="min-h-screen flex flex-col">
      <ScenarioBanner />
      <div className="flex-1 flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-surface-200 bg-surface-0 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-surface-200">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <span className="text-lg font-semibold text-surface-900">
              Burnless
            </span>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={buildHref(item.href)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-surface-600 hover:bg-surface-50 hover:text-surface-900"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-brand-600" : "text-surface-400"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-2 space-y-1">
          {/* Cmd+K shortcut */}
          <button
            onClick={() => setAiPanelOpen(true)}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-surface-500 hover:bg-surface-50 hover:text-surface-900 transition-colors"
          >
            <Command className="h-4 w-4 text-surface-400" />
            <span className="flex-1 text-left">Ask AI</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-surface-200 bg-surface-50 px-1.5 py-0.5 text-[10px] font-mono text-surface-400">
              <span className="text-xs">&#8984;</span>K
            </kbd>
          </button>

          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={buildHref(item.href)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-surface-600 hover:bg-surface-50 hover:text-surface-900"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-brand-600" : "text-surface-400"}`} />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-surface-200">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-surface-200 flex items-center justify-center">
              <span className="text-xs font-medium text-surface-600">U</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-900 truncate">
                User
              </p>
              <p className="text-xs text-surface-500 truncate">
                user@startup.com
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-surface-50 overflow-auto">
        <div className="p-8">{children}</div>
      </main>

      {/* Global AI Panel (Cmd+K) */}
      <AiPanel open={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
    </div>
    </div>
    </ScenarioProvider>
    </Suspense>
  );
}
