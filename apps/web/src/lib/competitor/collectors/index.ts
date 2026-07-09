import type { Collector } from "./types";
import { pricingCollector } from "./pricing";
import { socialCollector } from "./social";
import { feedCollector } from "./feed";
import { sitemapCollector } from "./sitemap";

const COLLECTORS: Record<string, Collector> = {
  [pricingCollector.type]: pricingCollector,
  [socialCollector.type]: socialCollector,
  [feedCollector.type]: feedCollector,
  [sitemapCollector.type]: sitemapCollector,
};

export function getCollector(type: string): Collector | null {
  return COLLECTORS[type] ?? null;
}

export * from "./types";
