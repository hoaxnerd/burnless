"use client";

/**
 * InitialLayoutsProvider — passes server-fetched page layouts to PageLayoutProvider.
 *
 * The shared dashboard layout.tsx fetches preferences once and provides
 * pageLayouts here. Each PageLayoutProvider reads its own page's initial
 * layout from this context, avoiding per-page API fetches and layout flicker.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { StoredPageLayout } from "@/lib/widget-order";

/**
 * Per-page server-fetched layout data. May be in the new `order` form or a
 * legacy coordinate `layout` form — consumers resolve via deriveWidgetOrder().
 */
type InitialLayouts = Record<string, StoredPageLayout>;

const InitialLayoutsCtx = createContext<InitialLayouts>({});

export function InitialLayoutsProvider({
  layouts,
  children,
}: {
  layouts: InitialLayouts;
  children: ReactNode;
}) {
  return (
    <InitialLayoutsCtx.Provider value={layouts}>
      {children}
    </InitialLayoutsCtx.Provider>
  );
}

/** Returns the server-fetched page layouts map. */
export function useInitialLayouts(): InitialLayouts {
  return useContext(InitialLayoutsCtx);
}
