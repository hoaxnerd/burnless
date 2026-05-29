import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { crawlSchema, browserUseSchema, webScrapingHandlers } from "../web-scraping";

describe("web-scraping AI tools", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
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
    it("executes crawl handler successfully", async () => {
      process.env.JINA_API_KEY = "test-jina-key2";
      const mockFetchResponse = {
        ok: true,
        text: async () => "Jina Crawl page content...",
      };
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(mockFetchResponse as any);

      const result = await webScrapingHandlers.read_webpage({ url: "https://example.com/pricing" }, {} as any);
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

      const result = await webScrapingHandlers.read_webpage_rendered({ url: "https://example.com/blocked" }, {} as any);
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
        webScrapingHandlers.read_webpage_rendered({ url: "https://example.com/blocked" }, {} as any)
      ).rejects.toThrow("CLOUDFLARE_API_TOKEN is not configured");
    });
  });
});
