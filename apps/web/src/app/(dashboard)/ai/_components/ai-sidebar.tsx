"use client";

import { useEffect, useState } from "react";
import {
  MessageSquarePlus, Lightbulb, History, Settings as SettingsIcon,
  Zap, X, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";

export type AiPane = "insights" | "history" | "settings";

interface AiSidebarProps {
  credits: { remaining: number; total: number } | null;
  companionName: string;
  activePane: AiPane | null;
  onSelectPane: (pane: AiPane) => void;
  onNewChat: () => void;
  /** Mobile drawer open state (controlled by the page). */
  mobileOpen: boolean;
  onMobileClose: () => void;
  children: React.ReactNode; // active pane content
}

const NAV: { id: AiPane; label: string; icon: React.ReactNode }[] = [
  { id: "insights", label: "Insights", icon: <Lightbulb className="h-4 w-4" /> },
  { id: "history", label: "History", icon: <History className="h-4 w-4" /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon className="h-4 w-4" /> },
];

export function AiSidebar(props: AiSidebarProps) {
  const { mobileOpen, onMobileClose } = props;
  // Persist desktop collapse across reloads. Initialize false so the first client
  // render matches the SSR HTML (no localStorage on the server) — then read the
  // saved value in an effect after mount. A lazy initializer that reads
  // localStorage would diverge from SSR and cause a hydration mismatch.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem("ai_sidebar_collapsed") === "1");
  }, []);

  // Mobile drawer a11y: Escape closes it.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileClose]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("ai_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }

  const inner = (mobile: boolean) => (
    <div className="flex h-full flex-col">
      {/* Meta strip */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-surface-100">
        {!collapsed || mobile ? (
          <div className="flex items-center gap-1.5 text-xs text-surface-400">
            <Zap className="h-3 w-3 text-accent-500" />
            {props.credits ? (
              <span>
                {props.credits.remaining.toLocaleString()} / {props.credits.total.toLocaleString()} credits
              </span>
            ) : (
              <span>Loading…</span>
            )}
          </div>
        ) : (
          <Zap className="h-4 w-4 text-accent-500 mx-auto" />
        )}
        {mobile ? (
          <button onClick={props.onMobileClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-surface-100">
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={toggleCollapsed} aria-label="Toggle sidebar" className="p-1.5 rounded-lg hover:bg-surface-100">
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Nav */}
      <div className="px-2 py-2 space-y-1 border-b border-surface-100">
        <NavButton collapsed={collapsed && !mobile} icon={<MessageSquarePlus className="h-4 w-4" />} label="New Chat" highlight onClick={props.onNewChat} />
        {NAV.map((n) => (
          <NavButton
            key={n.id}
            collapsed={collapsed && !mobile}
            icon={n.icon}
            label={n.label}
            active={props.activePane === n.id}
            onClick={() => props.onSelectPane(n.id)}
          />
        ))}
      </div>

      {/* Active pane content */}
      {(!collapsed || mobile) && <div className="flex-1 overflow-auto">{props.children}</div>}
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        className={`hidden lg:flex flex-shrink-0 rounded-2xl border border-surface-200 bg-surface-0 overflow-hidden transition-[width] duration-200 ${
          collapsed ? "w-14" : "w-80"
        }`}
      >
        {inner(false)}
      </aside>

      {/* Mobile drawer */}
      {props.mobileOpen && (
        <>
          <div className="lg:hidden fixed inset-0 z-40 bg-black/40 animate-fade-in" onClick={props.onMobileClose} aria-hidden />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="AI menu"
            className="lg:hidden fixed inset-y-0 left-0 z-50 w-80 max-w-[85%] bg-surface-0 border-r border-surface-200 shadow-xl animate-slide-up"
          >
            {inner(true)}
          </aside>
        </>
      )}
    </>
  );
}

function NavButton({
  icon, label, onClick, active, highlight, collapsed,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  highlight?: boolean;
  collapsed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
        highlight
          ? "bg-brand-600 text-white hover:bg-brand-700"
          : active
            ? "bg-brand-50 text-brand-600"
            : "text-surface-600 hover:bg-surface-100"
      } ${collapsed ? "justify-center px-0" : ""}`}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </button>
  );
}
