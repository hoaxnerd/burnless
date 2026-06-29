import type { Collector } from "./types";
import { pricingCollector } from "./pricing";
// import { socialCollector } from "./social"; // Task 6 adds this

const COLLECTORS: Record<string, Collector> = {
  [pricingCollector.type]: pricingCollector,
  // [socialCollector.type]: socialCollector, // Task 6
};

export function getCollector(type: string): Collector | null {
  return COLLECTORS[type] ?? null;
}

export * from "./types";
