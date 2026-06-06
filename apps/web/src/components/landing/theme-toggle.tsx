"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

const THEME_KEY = "burnless-theme";

/* Landing theme toggle. The landing page defaults to light (see the blocking
   script in page.tsx); this lets a visitor override to dark. Persists to the
   shared `burnless-theme` key so the choice carries into the app. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // Sync initial icon to the class the blocking script already applied.
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      /* localStorage unavailable — ignore */
    }
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
