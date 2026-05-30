"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { subscribeMutation } from "@/lib/mutation-bus";

/**
 * Cross-tab freshness. Same-tab refresh is owned by the mutating component itself
 * (it already calls router.refresh() immediately after its apiFetch), so this provider
 * deliberately does NOT refresh on same-tab events — that would double the RSC recompute.
 *
 * Its job is the genuinely-new capability: when ANOTHER tab mutates financial data, mark
 * this tab dirty and refresh it the moment it next becomes active (focus/visibility) —
 * the focus-reconcile pattern from scenario-context.tsx. Insight staleness is handled
 * separately by use-insight-cache subscribing to the same bus.
 */
export function DataFreshnessProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const dirtyRef = useRef(false);

  useEffect(() => {
    const unsub = subscribeMutation((e) => {
      // Only cross-tab events; same-tab is the mutating component's responsibility.
      if (e.crossTab) dirtyRef.current = true;
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
      document.removeEventListener("visibilitychange", onActive);
      window.removeEventListener("focus", onActive);
    };
  }, [router]);

  return <>{children}</>;
}
