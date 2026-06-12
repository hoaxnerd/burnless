"use client";

import { useSyncExternalStore } from "react";
import {
  MessageSquarePlus, Lightbulb, History, Wrench,
  Zap, X, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { Overlay } from "@/components/ui";

export type AiPane = "insights" | "history" | "tools";

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
  { id: "tools", label: "Tools", icon: <Wrench className="h-4 w-4" /> },
];

const SIDEBAR_COLLAPSE_KEY = "ai_sidebar_collapsed";
const SIDEBAR_COLLAPSE_EVENT = "ai-sidebar-collapse";

// Read desktop-collapse from localStorage via useSyncExternalStore: the server
// snapshot is always false (matching the SSR HTML), so there is no hydration
// mismatch, and there is no setState-inside-an-effect (which a lazy useState
// initializer or an effect would each introduce — the former a hydration error,
// the latter a react-compiler lint error).
function subscribeCollapsed(callback: () => void) {
  window.addEventListener(SIDEBAR_COLLAPSE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(SIDEBAR_COLLAPSE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
function getCollapsedSnapshot() {
  return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1";
}
function getCollapsedServerSnapshot() {
  return false;
}

export function AiSidebar(props: AiSidebarProps) {
  const { mobileOpen, onMobileClose } = props;
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    getCollapsedServerSnapshot
  );

  function toggleCollapsed() {
    const next = !collapsed;
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(SIDEBAR_COLLAPSE_EVENT));
  }

  const inner = (mobile: boolean) => (
    // w-full: the desktop <aside> is display:flex, so without an explicit width
    // this column shrinks to its intrinsic content width (~194px) and leaves a
    // dead whitespace band on the right of the 320px card. Fill the card so the
    // nav + active pane stretch edge-to-edge and respond to the card width.
    <div className="flex h-full w-full flex-col">
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
      <Overlay
        open={props.mobileOpen}
        onClose={props.onMobileClose}
        ariaLabel="AI menu"
        className="lg:hidden !p-0 !items-stretch !justify-start"
      >
        {(panelProps) => (
          <aside
            {...panelProps}
            className="lg:hidden w-80 max-w-[85%] bg-surface-0 border-r border-surface-200 shadow-xl animate-slide-up"
          >
            {inner(true)}
          </aside>
        )}
      </Overlay>
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
