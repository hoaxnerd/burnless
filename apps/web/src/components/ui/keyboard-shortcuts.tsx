"use client";

import { useState, useEffect, useCallback, createContext, useContext, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useOptionalAiFlags } from "@/components/ai/ai-feature-context";

interface Shortcut {
  key: string;
  label: string;
  description: string;
  action: () => void;
  meta?: boolean;
  shift?: boolean;
}

interface ShortcutsContextValue {
  showHelp: boolean;
  setShowHelp: (show: boolean) => void;
  /** Register page-specific shortcuts. Returns unregister function. */
  registerPageShortcuts: (shortcuts: Shortcut[]) => () => void;
}

const ShortcutsContext = createContext<ShortcutsContextValue>({
  showHelp: false,
  setShowHelp: () => {},
  registerPageShortcuts: () => () => {},
});

export function useShortcuts() {
  return useContext(ShortcutsContext);
}

/**
 * Hook for pages to register their own keyboard shortcuts.
 * Shortcuts are automatically unregistered when the component unmounts.
 *
 * Usage:
 *   usePageShortcuts([
 *     { key: "n", label: "N", description: "New expense", action: () => setShowForm(true) },
 *   ]);
 */
export function usePageShortcuts(shortcuts: Shortcut[]) {
  const { registerPageShortcuts } = useShortcuts();
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    const unregister = registerPageShortcuts(shortcutsRef.current);
    return unregister;
  }, [registerPageShortcuts]);
}

export function KeyboardShortcutsProvider({
  children,
  onToggleAI,
}: {
  children: React.ReactNode;
  onToggleAI: () => void;
}) {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);
  const [pageShortcuts, setPageShortcuts] = useState<Shortcut[]>([]);
  const aiFlags = useOptionalAiFlags();
  const companionName = aiFlags?.companionName ?? "Companion";

  const globalShortcuts: Shortcut[] = useMemo(
    () => [
      { key: "k", label: "Cmd+K", description: `Toggle ${companionName}`, action: onToggleAI, meta: true },
      { key: "d", label: "G then D", description: "Go to Dashboard", action: () => router.push("/dashboard") },
      { key: "e", label: "G then E", description: "Go to Expenses", action: () => router.push("/expenses") },
      { key: "r", label: "G then R", description: "Go to Revenue", action: () => router.push("/revenue") },
      { key: "f", label: "G then F", description: "Go to Funding", action: () => router.push("/funding") },
      { key: "t", label: "G then T", description: "Go to Team", action: () => router.push("/team") },
      { key: "s", label: "G then S", description: "Go to Scenarios", action: () => router.push("/scenarios") },
      { key: "p", label: "G then P", description: "Go to Reports", action: () => router.push("/reports") },
      { key: "i", label: "G then I", description: "Go to Data Room", action: () => router.push("/data-room") },
      { key: "?", label: "?", description: "Show keyboard shortcuts", action: () => setShowHelp(true), shift: true },
    ],
    [onToggleAI, router],
  );

  const registerPageShortcuts = useCallback((shortcuts: Shortcut[]) => {
    setPageShortcuts(shortcuts);
    return () => setPageShortcuts([]);
  }, []);

  // "G then X" navigation pattern
  const [goPending, setGoPending] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) {
        return;
      }

      // Meta+K: AI toggle (handled elsewhere but also here for consistency)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        return; // Already handled in layout
      }

      // Escape: close help
      if (e.key === "Escape" && showHelp) {
        setShowHelp(false);
        return;
      }

      // ? for help
      if (e.key === "?" && e.shiftKey) {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }

      // Page-specific shortcuts (single key, no G prefix needed)
      if (!goPending && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        const pageShortcut = pageShortcuts.find((s) => s.key === e.key);
        if (pageShortcut) {
          e.preventDefault();
          pageShortcut.action();
          return;
        }
      }

      // "G" key starts navigation sequence
      if (e.key === "g" && !e.metaKey && !e.ctrlKey) {
        setGoPending(true);
        setTimeout(() => setGoPending(false), 1500); // Reset after 1.5s
        return;
      }

      // Second key in "G then X" sequence
      if (goPending) {
        const shortcut = globalShortcuts.find((s) => s.key === e.key && !s.meta);
        if (shortcut) {
          e.preventDefault();
          shortcut.action();
          setGoPending(false);
        }
      }
    },
    [goPending, showHelp, globalShortcuts, pageShortcuts]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const contextValue = useMemo(
    () => ({ showHelp, setShowHelp, registerPageShortcuts }),
    [showHelp, registerPageShortcuts],
  );

  return (
    <ShortcutsContext.Provider value={contextValue}>
      {children}

      {/* Shortcuts help modal */}
      {showHelp && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowHelp(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
            <div className="bg-surface-0 rounded-2xl shadow-xl border border-surface-200 w-full max-w-md animate-scale-in">
              <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
                <h2 className="text-sm font-semibold text-surface-900">Keyboard Shortcuts</h2>
                <button
                  onClick={() => setShowHelp(false)}
                  className="rounded-lg p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-6 space-y-5 max-h-[60vh] overflow-auto">
                <div>
                  <p className="text-[10px] font-medium uppercase text-surface-400 tracking-wider mb-2">General</p>
                  <ShortcutRow label="Cmd+K" description="Search & commands" />
                  <ShortcutRow label="Shift+?" description="Show this help" />
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase text-surface-400 tracking-wider mb-2">Navigation (press G, then...)</p>
                  <ShortcutRow label="G D" description="Dashboard" />
                  <ShortcutRow label="G E" description="Expenses" />
                  <ShortcutRow label="G R" description="Revenue" />
                  <ShortcutRow label="G F" description="Funding" />
                  <ShortcutRow label="G T" description="Team" />
                  <ShortcutRow label="G S" description="Scenarios" />
                  <ShortcutRow label="G P" description="Reports" />
                  <ShortcutRow label="G I" description="Data Room" />
                </div>
                {pageShortcuts.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium uppercase text-surface-400 tracking-wider mb-2">This Page</p>
                    {pageShortcuts.map((s) => (
                      <ShortcutRow key={s.key} label={s.label} description={s.description} />
                    ))}
                  </div>
                )}
              </div>
              <div className="px-6 py-3 border-t border-surface-100 bg-surface-50 rounded-b-2xl">
                <p className="text-[10px] text-surface-400 text-center">
                  Press <kbd className="font-mono bg-surface-200 px-1 rounded text-surface-500">Esc</kbd> to close
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* "Go to..." indicator */}
      {goPending && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 rounded-xl bg-surface-900 px-4 py-2 text-xs text-white shadow-lg animate-scale-in">
          <kbd className="font-mono font-bold">g</kbd> <span className="text-surface-400">then press a key to navigate...</span>
        </div>
      )}
    </ShortcutsContext.Provider>
  );
}

function ShortcutRow({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-surface-600">{description}</span>
      <kbd className="inline-flex items-center gap-0.5 rounded-md border border-surface-200 bg-surface-50 px-2 py-0.5 text-[10px] font-mono text-surface-500">
        {label}
      </kbd>
    </div>
  );
}
