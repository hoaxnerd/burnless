/**
 * Web scraping tool — read the readable markdown content of a single page.
 *
 * `read_webpage` routes through the engine `CrawlService` (default
 * `DirectFetchProvider` — native, keyless, no Docker; see
 * `packages/engine/src/services/crawl.ts`). This keeps the readable-page tool
 * fully local for the OSS standalone edition. (S3a #33.)
 *
 * Full browser control (JS-rendered / anti-bot pages) is no longer a built-in
 * tool — the Cloudflare-CDP `read_webpage_rendered` tool was removed (S3a #33).
 * Browser-use is now MCP-only: connect a Playwright MCP server (self-host).
 *
 * Output is capped at MAX_RESULT_CHARS with a truncation marker so the agent
 * knows the content was cut. Without that marker the model has been observed
 * treating partial pages as complete and missing info that lives below the
 * fold (pricing tables, founder bios, etc.).
 */

import { createCrawlService } from "@burnless/engine";
import { z } from "zod";
import type { ToolHandler } from "./types";

// ── Configuration ────────────────────────────────────────────────────────────

const MAX_RESULT_CHARS = 8_000;
const TRUNCATION_SUFFIX = "\n\n…[truncated — content exceeded result limit]";

// ── Schemas ──────────────────────────────────────────────────────────────────

export const crawlSchema = z.object({
  url: z.string().url("Must be a valid URL"),
});

// ── Internal helpers ─────────────────────────────────────────────────────────

function truncate(text: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text;
  return text.slice(0, MAX_RESULT_CHARS) + TRUNCATION_SUFFIX;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

const handleCrawl: ToolHandler = async (input) => {
  const { url } = crawlSchema.parse(input);
  const result = await createCrawlService().crawl(url, undefined);
  if (!result.success || !result.markdown) {
    const reason = result.error ?? `HTTP ${result.statusCode}`;
    return `Could not read ${url} (${reason}). The page may be unreachable or block automated reads — try search_web for the same information.`;
  }
  return truncate(result.markdown);
};

// ── Exports ──────────────────────────────────────────────────────────────────

export const webScrapingSchemas = {
  read_webpage: crawlSchema,
} satisfies Record<string, z.ZodType>;

export const webScrapingHandlers = {
  read_webpage: handleCrawl,
} satisfies Record<string, ToolHandler>;
