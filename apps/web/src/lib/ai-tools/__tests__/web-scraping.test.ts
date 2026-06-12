import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the engine crawl service — read_webpage now routes through it (C3),
// not the hosted Jina Reader.
const crawlMock = vi.fn();
vi.mock("@burnless/engine", () => ({
  createCrawlService: () => ({ crawl: crawlMock }),
}));

import { crawlSchema, browserUseSchema, webScrapingHandlers } from "../web-scraping";

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
