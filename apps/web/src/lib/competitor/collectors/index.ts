import type { Collector } from "./types";
import { pricingCollector } from "./pricing";
import { socialCollector } from "./social";

const COLLECTORS: Record<string, Collector> = {
  [pricingCollector.type]: pricingCollector,
  [socialCollector.type]: socialCollector,
};

export function getCollector(type: string): Collector | null {
  return COLLECTORS[type] ?? null;
}

export * from "./types";
