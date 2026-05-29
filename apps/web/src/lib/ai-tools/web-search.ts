/**
 * Web search tool — lets the AI search the web for real-time information.
 * Uses the web search service abstraction (SearXNG locally, Tavily in production).
 */

import { z } from "zod";
import { createWebSearchService } from "@burnless/engine";
import type { ToolHandler } from "./types";

// ── Schemas ──────────────────────────────────────────────────────────────────

export const webSearchSchema = z.object({
  query: z.string().min(1, "Search query is required").max(500, "Query too long"),
  maxResults: z.number().int().min(1).max(10).default(5),
  timeRange: z.enum(["day", "week", "month", "year"]).optional(),
});

// ── Handler ──────────────────────────────────────────────────────────────────

const handleWebSearch: ToolHandler = async (input) => {
  const { query, maxResults, timeRange } = input as z.infer<typeof webSearchSchema>;

  const searchService = createWebSearchService();
  const response = await searchService.search(query, {
    maxResults,
    timeRange,
  });

  if (response.results.length === 0) {
    return JSON.stringify({
      query,
      results: [],
      message: "No results found. Try a different query or broader search terms.",
    });
  }

  return JSON.stringify({
    query,
    totalResults: response.totalResults,
    processingTimeMs: response.processingTimeMs,
    results: response.results.map((r, i) => ({
      rank: i + 1,
      title: r.title,
      url: r.url,
      snippet: r.snippet,
    })),
  });
};

// ── Exports ──────────────────────────────────────────────────────────────────

export const webSearchSchemas: Record<string, z.ZodType> = {
  search_web: webSearchSchema,
};

export const webSearchHandlers: Record<string, ToolHandler> = {
  search_web: handleWebSearch,
};
