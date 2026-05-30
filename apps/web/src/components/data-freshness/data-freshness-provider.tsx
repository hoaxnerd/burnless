"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { subscribeMutation } from "@/lib/mutation-bus";

const DEBOUNCE_MS = 300;

/**
 * Subscribes to the mutation bus and keeps the rendered RSC fresh:
 *   - same-tab mutation  → debounced router.refresh() (coalesces edit bursts)
 *   - cross-tab mutation → mark dirty, refresh on next focus/visibility
 * Insight staleness is handled separately by use-insight-cache subscribing to the
 * same bus.
 */
export function DataFreshnessProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = subscribeMutation((e) => {
      if (e.crossTab) {
        dirtyRef.current = true;
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    });

    const onActive = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (dirtyRef.current) {
        dirtyRef.current = false;
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onActive);
    window.addEventListener("focus", onActive);

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onActive);
      window.removeEventListener("focus", onActive);
    };
  }, [router]);

  return <>{children}</>;
}
