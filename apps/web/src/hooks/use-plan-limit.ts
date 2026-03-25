"use client";

/**
 * usePlanLimit — detects PLAN_LIMIT_REACHED errors from API responses.
 *
 * Usage:
 *   const { planLimit, checkResponse, clearLimit } = usePlanLimit();
 *
 *   // In a fetch handler:
 *   const res = await fetch("/api/scenarios", { method: "POST", ... });
 *   if (checkResponse(res)) return; // 403 with plan limit — `planLimit` is now set
 *
 *   // In JSX:
 *   {planLimit && <UpgradePrompt limit={planLimit} />}
 */

import { useState, useCallback } from "react";
import type { PlanLimitInfo } from "@/components/ui/upgrade-prompt";

export function usePlanLimit() {
  const [planLimit, setPlanLimit] = useState<PlanLimitInfo | null>(null);

  /**
   * Check a fetch Response for a plan limit error.
   * Returns `true` if a plan limit was detected (caller should stop processing).
   * Returns `false` if the response is not a plan limit error (caller continues normally).
   */
  const checkResponse = useCallback(async (res: Response): Promise<boolean> => {
    if (res.status !== 403) return false;

    try {
      const body = await res.json();
      if (body.code === "PLAN_LIMIT_REACHED" && body.upgradeTarget) {
        setPlanLimit({
          message: body.error || "You've reached your plan limit.",
          upgradeTarget: body.upgradeTarget,
        });
        return true;
      }
    } catch {
      // Not a JSON response or missing fields — not a plan limit
    }

    return false;
  }, []);

  /**
   * Parse a pre-parsed error body (when you've already read the JSON).
   * Returns `true` if a plan limit was detected.
   */
  const checkErrorBody = useCallback(
    (status: number, body: { code?: string; error?: string; upgradeTarget?: string }): boolean => {
      if (status === 403 && body.code === "PLAN_LIMIT_REACHED" && body.upgradeTarget) {
        setPlanLimit({
          message: body.error || "You've reached your plan limit.",
          upgradeTarget: body.upgradeTarget as "pro" | "team",
        });
        return true;
      }
      return false;
    },
    [],
  );

  const clearLimit = useCallback(() => setPlanLimit(null), []);

  return { planLimit, checkResponse, checkErrorBody, clearLimit };
}
