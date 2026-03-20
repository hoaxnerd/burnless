"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";
import type { FinancialAlert, AlertSeverity } from "@/lib/alerts";

const ALERT_STORAGE_KEY = "burnless-dismissed-alerts";

/** Map alert severity → toast variant. */
const severityToVariant: Record<AlertSeverity, "error" | "warning" | "info" | "success"> = {
  critical: "error",
  warning: "warning",
  info: "info",
  celebration: "success",
};

/** Get IDs of alerts already shown this session. */
function getDismissedAlerts(): Set<string> {
  try {
    const raw = sessionStorage.getItem(ALERT_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

/** Mark an alert as shown for this session. */
function markAlertShown(id: string) {
  try {
    const dismissed = getDismissedAlerts();
    dismissed.add(id);
    sessionStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify([...dismissed]));
  } catch {
    // sessionStorage not available
  }
}

/**
 * Hook that fetches proactive financial alerts and surfaces them as toast
 * notifications. Only shows each alert once per browser session.
 *
 * Place this in the dashboard shell so it runs on every page navigation.
 */
export function useProactiveAlerts() {
  const { toast } = useToast();
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/alerts", { signal: controller.signal });
        if (!res.ok) return;

        const { alerts }: { alerts: FinancialAlert[] } = await res.json();
        if (!alerts?.length) return;

        const dismissed = getDismissedAlerts();

        // Stagger alerts by 800ms for a polished feel
        let delay = 500;
        for (const alert of alerts) {
          if (dismissed.has(alert.id)) continue;

          setTimeout(() => {
            toast({
              variant: severityToVariant[alert.severity],
              message: alert.title,
              description: alert.message,
              duration: alert.severity === "critical" ? 0 : 8000, // critical stays until dismissed
            });
            markAlertShown(alert.id);
          }, delay);
          delay += 800;
        }
      } catch {
        // Silently fail — alerts are non-critical
      }
    })();

    return () => controller.abort();
  }, [toast]);
}
