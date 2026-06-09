"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

const THEME_KEY = "burnless-theme";
const THEME_EVENT = "burnless-theme-change";

/* Landing theme toggle. The landing page defaults to light (see the blocking
   script in page.tsx); this lets a visitor override to dark. Persists to the
   shared `burnless-theme` key so the choice carries into the app.

   The dark flag is read from the live `<html class="dark">` (already applied by
   the blocking script) via useSyncExternalStore rather than a mount effect: the
   server snapshot is always false (matching the landing's light SSR default) so
   there is no hydration mismatch, and there is no setState-inside-an-effect
   (which the previous mount-effect introduced — a react-compiler lint error). */
function subscribeTheme(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
function getDarkSnapshot() {
  return document.documentElement.classList.contains("dark");
}
function getDarkServerSnapshot() {
  return false;
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribeTheme,
    getDarkSnapshot,
    getDarkServerSnapshot
  );

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      /* localStorage unavailable — ignore */
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-9 w-9 items-center justify-center rounded-full text-surface-600 transition-colors hover:bg-surface-100/70 hover:text-surface-900"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
