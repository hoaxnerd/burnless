import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchSchema, crawlSchema, browserUseSchema, webScrapingHandlers } from "../web-scraping";

describe("web-scraping AI tools", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("search tool validation", () => {
    it("accepts valid query", () => {
      const result = searchSchema.safeParse({ query: "stripe funding rounds" });
      expect(result.success).toBe(true);
    });

    it("rejects empty query", () => {
      const result = searchSchema.safeParse({ query: "" });
      expect(result.success).toBe(false);
    });

    it("rejects excessively long query", () => {
      const result = searchSchema.safeParse({ query: "a".repeat(501) });
      expect(result.success).toBe(false);
    });
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

  describe("browser_use tool validation", () => {
    it("accepts valid URL", () => {
      const result = browserUseSchema.safeParse({ url: "https://stripe.com" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid URL", () => {
      const result = browserUseSchema.safeParse({ url: "not-a-url" });
      expect(result.success).toBe(false);
    });
  });

  describe("handlers execution", () => {
    it("executes search handler successfully", async () => {
      process.env.JINA_API_KEY = "test-jina-key";
      const mockFetchResponse = {
        ok: true,
        text: async () => "Jina Search Results content...",
      };
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(mockFetchResponse as any);

      const result = await webScrapingHandlers.search({ query: "test query" }, {} as any);
      expect(result).toBe("Jina Search Results content...");
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://s.jina.ai/test%20query",
        expect.objectContaining({
          headers: {
            "User-Agent": "burnless/1.0",
            Authorization: "Bearer test-jina-key",
          },
        })
      );
    });

    it("executes crawl handler successfully", async () => {
      process.env.JINA_API_KEY = "test-jina-key2";
      const mockFetchResponse = {
        ok: true,
        text: async () => "Jina Crawl page content...",
      };
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(mockFetchResponse as any);

      const result = await webScrapingHandlers.crawl({ url: "https://example.com/pricing" }, {} as any);
      expect(result).toBe("Jina Crawl page content...");
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://r.jina.ai/https://example.com/pricing",
        expect.objectContaining({
          headers: {
            "User-Agent": "burnless/1.0",
            Authorization: "Bearer test-jina-key2",
          },
        })
      );
    });

    it("executes browser_use handler successfully with Playwright mock", async () => {
      process.env.CLOUDFLARE_API_TOKEN = "cloudflare-token";

      // Mock playwright-core
      const mockPage = {
        goto: vi.fn(),
        evaluate: vi.fn().mockResolvedValue("Mocked browser body text"),
      };
      const mockContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
      };
      const mockBrowser = {
        contexts: vi.fn().mockReturnValue([mockContext]),
        close: vi.fn(),
      };
      const mockChromium = {
        connectOverCDP: vi.fn().mockResolvedValue(mockBrowser),
      };

      vi.doMock("playwright-core", () => ({
        chromium: mockChromium,
      }));

      const result = await webScrapingHandlers.browser_use({ url: "https://example.com/blocked" }, {} as any);
      expect(result).toBe("Mocked browser body text");
      expect(mockChromium.connectOverCDP).toHaveBeenCalledWith(
        "wss://chrome.cloudflare.com/cdp?api_token=cloudflare-token"
      );
      expect(mockPage.goto).toHaveBeenCalledWith("https://example.com/blocked", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it("fails browser_use if token is missing", async () => {
      delete process.env.CLOUDFLARE_API_TOKEN;
      delete process.env.CLOUDFLARE_BROWSER_TOKEN;

      await expect(
        webScrapingHandlers.browser_use({ url: "https://example.com/blocked" }, {} as any)
      ).rejects.toThrow("CLOUDFLARE_API_TOKEN is not configured");
    });
  });
});
