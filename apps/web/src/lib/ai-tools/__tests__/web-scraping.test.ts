import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the engine crawl service — read_webpage now routes through it (C3),
// not the hosted Jina Reader.
const crawlMock = vi.fn();
vi.mock("@burnless/engine", () => ({
  createCrawlService: () => ({ crawl: crawlMock }),
}));

import { crawlSchema, webScrapingHandlers, webScrapingSchemas } from "../web-scraping";

describe("web-scraping AI tools", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    crawlMock.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("crawl tool validation", () => {
    it("accepts valid URL", () => {
      const result = crawlSchema.safeParse({ url: "https://stripe.com" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid URL", () => {
      const result = crawlSchema.safeParse({ url: "not-a-url" });
      expect(result.success).toBe(false);
    });
  });

  describe("read_webpage_rendered is removed (C4 — browser-use is MCP-only now)", () => {
    it("no longer exports a handler", () => {
      expect("read_webpage_rendered" in webScrapingHandlers).toBe(false);
    });
    it("no longer exports a schema", () => {
      expect("read_webpage_rendered" in webScrapingSchemas).toBe(false);
    });
  });

  describe("handlers execution", () => {
    it("read_webpage uses the engine crawl service (not Jina) and returns its markdown", async () => {
      crawlMock.mockResolvedValue({
        url: "https://example.com/pricing",
        markdown: "# Pricing\n\nDirect-fetched page content.",
        statusCode: 200,
        success: true,
      });
      const fetchSpy = vi.spyOn(global, "fetch");

      const result = await webScrapingHandlers.read_webpage(
        { url: "https://example.com/pricing" },
        {} as any
      );

      expect(result).toBe("# Pricing\n\nDirect-fetched page content.");
      expect(crawlMock).toHaveBeenCalledWith("https://example.com/pricing", undefined);
      // Must NOT hit the hosted Jina Reader.
      const hitJina = fetchSpy.mock.calls.some(
        ([u]) => typeof u === "string" && u.includes("r.jina.ai")
      );
      expect(hitJina).toBe(false);
    });

    it("read_webpage returns a graceful message when the crawl fails", async () => {
      crawlMock.mockResolvedValue({
        url: "https://example.com/blocked",
        markdown: "",
        statusCode: 403,
        success: false,
        error: "HTTP 403",
      });

      const result = await webScrapingHandlers.read_webpage(
        { url: "https://example.com/blocked" },
        {} as any
      );

      expect(result).toContain("Could not read");
      expect(result).toContain("HTTP 403");
    });

  });
});
