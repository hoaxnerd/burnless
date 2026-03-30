"use client";

import { createContext, useContext, type ReactNode } from "react";

const PageContext = createContext<string | null>(null);

export function PageProvider({
  pageId,
  children,
}: {
  pageId: string;
  children: ReactNode;
}) {
  return <PageContext.Provider value={pageId}>{children}</PageContext.Provider>;
}

/** Returns the current page ID, or null if outside a PageProvider. */
export function usePageId(): string | null {
  return useContext(PageContext);
}
