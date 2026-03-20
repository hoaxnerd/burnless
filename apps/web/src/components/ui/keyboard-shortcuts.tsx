"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

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
}

const ShortcutsContext = createContext<ShortcutsContextValue>({
  showHelp: false,
  setShowHelp: () => {},
});

export function useShortcuts() {
  return useContext(ShortcutsContext);
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

  const shortcuts: Shortcut[] = [
    { key: "k", label: "Cmd+K", description: "Toggle AI Companion", action: onToggleAI, meta: true },
    { key: "d", label: "G then D", description: "Go to Dashboard", action: () => router.push("/dashboard") },
    { key: "e", label: "G then E", description: "Go to Expenses", action: () => router.push("/expenses") },
    { key: "r", label: "G then R", description: "Go to Revenue", action: () => router.push("/revenue") },
    { key: "f", label: "G then F", description: "Go to Funding", action: () => router.push("/funding") },
    { key: "t", label: "G then T", description: "Go to Team", action: () => router.push("/team") },
    { key: "s", label: "G then S", description: "Go to Scenarios", action: () => router.push("/scenarios") },
    { key: "p", label: "G then P", description: "Go to Reports", action: () => router.push("/reports") },
    { key: "i", label: "G then I", description: "Go to Data Room", action: () => router.push("/data-room") },
    { key: "?", label: "?", description: "Show keyboard shortcuts", action: () => setShowHelp(true), shift: true },
  ];

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

      // "G" key starts navigation sequence
      if (e.key === "g" && !e.metaKey && !e.ctrlKey) {
        setGoPending(true);
        setTimeout(() => setGoPending(false), 1500); // Reset after 1.5s
        return;
      }

      // Second key in "G then X" sequence
      if (goPending) {
        const shortcut = shortcuts.find((s) => s.key === e.key && !s.meta);
        if (shortcut) {
          e.preventDefault();
          shortcut.action();
          setGoPending(false);
        }
      }
    },
    [goPending, showHelp, shortcuts]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <ShortcutsContext.Provider value={{ showHelp, setShowHelp }}>
      {children}

      {/* Shortcuts help modal */}
      {showHelp && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowHelp(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
            <div className="bg-surface-0 rounded-xl shadow-xl border border-surface-200 w-full max-w-md">
              <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
                <h2 className="text-sm font-semibold text-surface-900">Keyboard Shortcuts</h2>
                <button
                  onClick={() => setShowHelp(false)}
                  className="rounded-lg p-1 text-surface-400 hover:text-surface-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-3 max-h-[60vh] overflow-auto">
                <div>
                  <p className="text-[10px] font-medium uppercase text-surface-400 tracking-wider mb-2">General</p>
                  <ShortcutRow label="Cmd+K" description="Toggle AI Companion" />
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
              </div>
            </div>
          </div>
        </>
      )}

      {/* "Go to..." indicator */}
      {goPending && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 rounded-lg bg-surface-900 px-3 py-1.5 text-xs text-white shadow-lg">
          <kbd className="font-mono">g</kbd> <span className="text-surface-400">then press a key to navigate...</span>
        </div>
      )}
    </ShortcutsContext.Provider>
  );
}

function ShortcutRow({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-surface-600">{description}</span>
      <kbd className="inline-flex items-center gap-0.5 rounded border border-surface-200 bg-surface-50 px-2 py-0.5 text-[10px] font-mono text-surface-500">
        {label}
      </kbd>
    </div>
  );
}
