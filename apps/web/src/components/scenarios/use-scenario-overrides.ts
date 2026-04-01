"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useScenario } from "./scenario-context";
import { apiFetch } from "@/lib/api-fetch";

export interface OverrideInfo {
  overrideId: string;
  entityId: string;
  action: "modify" | "create" | "delete";
  data: Record<string, unknown> | null;
  entityName?: string;
}

interface UseScenarioOverridesResult {
  /** Whether the scenario mode is active */
  isInScenarioMode: boolean;
  /** Map of entityId -> override info (for modify/create overrides) */
  overrideMap: Map<string, OverrideInfo>;
  /** List of entities that have been "deleted" (hidden) in the scenario */
  deletedEntities: OverrideInfo[];
  /** Whether overrides are still loading */
  isLoading: boolean;
  /** Revert a modified entity back to base values */
  handleRevert: (entityId: string) => Promise<void>;
  /** Remove a scenario-created entity */
  handleRemove: (entityId: string) => Promise<void>;
  /** Restore a deleted (hidden) entity */
  handleRestore: (entityId: string) => Promise<void>;
}

/**
 * Hook to fetch and manage scenario overrides for a specific entity type.
 *
 * When `isInScenarioMode` is false, returns empty maps and no-op handlers.
 * When active, fetches overrides from the API and provides revert/remove/restore actions.
 */
export function useScenarioOverrides(
  entityType: string,
): UseScenarioOverridesResult {
  const { activeScenarioId, isInScenarioMode } = useScenario();
  const router = useRouter();
  const [overrides, setOverrides] = useState<OverrideInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchOverrides = useCallback(async () => {
    if (!activeScenarioId) {
      setOverrides([]);
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiFetch(
        `/api/scenarios/overrides?scenarioId=${activeScenarioId}`,
      );
      if (!res.ok) {
        setOverrides([]);
        return;
      }
      const json = await res.json();
      const allOverrides: OverrideInfo[] = [];

      for (const group of json.groups ?? []) {
        if (group.entityType !== entityType) continue;
        for (const o of group.overrides ?? []) {
          allOverrides.push({
            overrideId: o.id,
            entityId: o.entityId,
            action: o.action,
            data: o.data,
            entityName: o.data?.name as string | undefined,
          });
        }
      }
      setOverrides(allOverrides);
    } catch {
      setOverrides([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeScenarioId, entityType]);

  useEffect(() => {
    if (isInScenarioMode) {
      fetchOverrides();
    } else {
      setOverrides([]);
    }
  }, [isInScenarioMode, fetchOverrides]);

  const { overrideMap, deletedEntities } = useMemo(() => {
    const map = new Map<string, OverrideInfo>();
    const deleted: OverrideInfo[] = [];
    for (const o of overrides) {
      if (o.action === "delete") {
        deleted.push(o);
      } else {
        map.set(o.entityId, o);
      }
    }
    return { overrideMap: map, deletedEntities: deleted };
  }, [overrides]);

  const deleteOverrideById = useCallback(
    async (overrideId: string) => {
      const res = await apiFetch(`/api/scenarios/overrides/${overrideId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete override");
      }
      router.refresh();
      // Re-fetch overrides after deletion
      await fetchOverrides();
    },
    [router, fetchOverrides],
  );

  const handleRevert = useCallback(
    async (entityId: string) => {
      const info = overrideMap.get(entityId);
      if (!info) return;
      await deleteOverrideById(info.overrideId);
    },
    [overrideMap, deleteOverrideById],
  );

  const handleRemove = useCallback(
    async (entityId: string) => {
      const info = overrideMap.get(entityId);
      if (!info) return;
      await deleteOverrideById(info.overrideId);
    },
    [overrideMap, deleteOverrideById],
  );

  const handleRestore = useCallback(
    async (entityId: string) => {
      const deleted = deletedEntities.find((d) => d.entityId === entityId);
      if (!deleted) return;
      await deleteOverrideById(deleted.overrideId);
    },
    [deletedEntities, deleteOverrideById],
  );

  return {
    isInScenarioMode,
    overrideMap,
    deletedEntities,
    isLoading,
    handleRevert,
    handleRemove,
    handleRestore,
  };
}
