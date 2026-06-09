"use client";

import { createContext, useContext, type ReactNode } from "react";

interface MetricDef {
  slug: string;
  name: string;
  description: string;
  formula: string;
  category: string;
  tier: string;
  requiresSaaS?: boolean;
  benchmark?: { label: string };
}

export interface CardCatalogValue {
  registry: MetricDef[];
  usedSlugs: Set<string>;
  heroSlugs: string[];
  onSelect: (slug: string) => void;
  onRemove: (slug: string) => void;
  onViewFormula: (slug: string) => void;
  categoryMeta: Record<string, { label: string }>;
  getDependencyTree: (slug: string) => string[];
  getDependents: (slug: string) => string[];
  getMetricDef: (slug: string) => MetricDef | undefined;
  swapMode: boolean;
  cardType: "metric" | "chart";
  /** Called when a user saves a metric selection for a specific card (cardSlug → selectedSlug). */
  onSaveForCard?: (cardSlug: string, selectedSlug: string) => void;
  /**
   * DASH-01: called when a user resets a specific card to its default metric.
   * For dashboard hero cards this restores the engine-default slug, pairing
   * with the per-card display-mode reset so 'Reset to default' is consistent.
   */
  onResetForCard?: (cardSlug: string) => void;
}

const CardCatalogCtx = createContext<CardCatalogValue | null>(null);

export function CardCatalogProvider({
  value,
  children,
}: {
  value: CardCatalogValue;
  children: ReactNode;
}) {
  return (
    <CardCatalogCtx.Provider value={value}>{children}</CardCatalogCtx.Provider>
  );
}

/** Returns the card catalog context. Throws if outside a provider. */
export function useCardCatalog(): CardCatalogValue {
  const ctx = useContext(CardCatalogCtx);
  if (!ctx) throw new Error("useCardCatalog must be used within a CardCatalogProvider");
  return ctx;
}

/** Returns the card catalog context, or null if outside a provider. */
export function useOptionalCardCatalog(): CardCatalogValue | null {
  return useContext(CardCatalogCtx);
}
