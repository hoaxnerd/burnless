// Service abstractions — swappable between local dev and production providers

export {
  createSearchService,
  resetSearchService,
  MeiliSearchProvider,
  NoopSearchProvider,
  type SearchService,
  type SearchDocument,
  type SearchResult,
  type SearchOptions,
} from "./search";

export {
  createCrawlService,
  resetCrawlService,
  Crawl4AIProvider,
  NoopCrawlProvider,
  type CrawlService,
  type CrawlResult,
  type CrawlOptions,
} from "./crawl";
