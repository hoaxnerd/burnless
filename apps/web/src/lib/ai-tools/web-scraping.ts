/**
 * Web scraping tools — read a single page and a browser-rendering fallback for
 * pages that anti-bot defenses block. Centralized handlers for Jina AI's
 * Reader API and Cloudflare Browser Rendering.
 *
 * Each handler caps its output at MAX_RESULT_CHARS and appends a truncation
 * marker so the agent knows the content was cut. Without that marker the
 * model has been observed treating partial pages as complete and missing
 * info that lives below the fold (pricing tables, founder bios, etc.).
 */

import { z } from "zod";
import type { ToolHandler } from "./types";

// ── Configuration ────────────────────────────────────────────────────────────

const MAX_RESULT_CHARS = 8_000;
const TRUNCATION_SUFFIX = "\n\n…[truncated — content exceeded result limit]";
const FETCH_TIMEOUT_MS = 12_000;
const BROWSER_NAV_TIMEOUT_MS = 15_000;
const BROWSER_CDP_ENDPOINT = "wss://chrome.cloudflare.com/cdp";
const USER_AGENT = "burnless/1.0";

// ── Schemas ──────────────────────────────────────────────────────────────────

export const crawlSchema = z.object({
  url: z.string().url("Must be a valid URL"),
});

export const browserUseSchema = z.object({
  url: z.string().url("Must be a valid URL"),
});

// ── Internal helpers ─────────────────────────────────────────────────────────

function truncate(text: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text;
  return text.slice(0, MAX_RESULT_CHARS) + TRUNCATION_SUFFIX;
}

function jinaHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (process.env.JINA_API_KEY) {
    headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
  }
  return headers;
}

async function fetchJina(url: string, kind: "reader"): Promise<string> {
  const res = await fetch(url, {
    headers: jinaHeaders(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Jina ${kind} returned status ${res.status}: ${res.statusText}`);
  }
  return truncate(await res.text());
}

// ── Handlers ──────────────────────────────────────────────────────────────────

const handleCrawl: ToolHandler = async (input) => {
  const { url } = crawlSchema.parse(input);
  return fetchJina(`https://r.jina.ai/${url}`, "reader");
};

const handleBrowserUse: ToolHandler = async (input) => {
  const { url } = browserUseSchema.parse(input);
  const apiToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_BROWSER_TOKEN;
  if (!apiToken) {
    throw new Error("CLOUDFLARE_API_TOKEN is not configured. Browser rendering fallback unavailable.");
  }

  // `playwright-core` is a sizable dependency — dynamic import keeps it out of
  // the cold-start path of routes that never reach the fallback.
  const { chromium } = await import("playwright-core");
  const browser = await chromium.connectOverCDP(`${BROWSER_CDP_ENDPOINT}?api_token=${apiToken}`);

  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: BROWSER_NAV_TIMEOUT_MS });

    const bodyText = await page.evaluate(() => {
      document
        .querySelectorAll("script, style, head, nav, footer, iframe")
        .forEach((el) => el.remove());
      return document.body.innerText;
    });

    return truncate(bodyText.trim());
  } finally {
    await browser.close();
  }
};

// ── Exports ──────────────────────────────────────────────────────────────────

export const webScrapingSchemas = {
  read_webpage: crawlSchema,
  read_webpage_rendered: browserUseSchema,
} satisfies Record<string, z.ZodType>;

export const webScrapingHandlers = {
  read_webpage: handleCrawl,
  read_webpage_rendered: handleBrowserUse,
} satisfies Record<string, ToolHandler>;
