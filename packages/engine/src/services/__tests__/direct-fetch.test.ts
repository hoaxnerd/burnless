import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectFetchProvider } from "../direct-fetch";
import type { CrawlResult } from "../crawl";

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
  <head>
    <title>Example &amp; Co</title>
    <style>.x { color: red }</style>
    <script>console.log("ignore me");</script>
  </head>
  <body>
    <nav>skip nav</nav>
    <h1>Welcome</h1>
    <p>First paragraph with <b>bold</b> &amp; an entity.</p>
    <p>Second   paragraph    with   extra   spaces.</p>
    <!-- a comment -->
  </body>
</html>
`;

function mockFetch(body: string, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    headers: { get: () => "text/html" },
  } as unknown as Response);
}

describe("DirectFetchProvider", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches HTML and extracts readable text/markdown on 200", async () => {
    globalThis.fetch = mockFetch(SAMPLE_HTML);
    const provider = new DirectFetchProvider();
    const res: CrawlResult = await provider.crawl("https://example.com");

    expect(res.url).toBe("https://example.com");
    expect(res.success).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.title).toBe("Example & Co");

    // script/style contents stripped.
    expect(res.markdown).not.toContain("console.log");
    expect(res.markdown).not.toContain("color: red");
    // body text present, entities decoded, whitespace collapsed.
    expect(res.markdown).toContain("Welcome");
    expect(res.markdown).toContain("First paragraph with bold & an entity.");
    expect(res.markdown).toContain("Second paragraph with extra spaces.");
    expect(res.markdown).not.toMatch(/ {2,}/);
    expect(res.error).toBeUndefined();
  });

  it("returns success:false (no throw) on a non-200", async () => {
    globalThis.fetch = mockFetch("not found", 404);
    const provider = new DirectFetchProvider();
    const res = await provider.crawl("https://example.com/missing");

    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(404);
    expect(res.markdown).toBe("");
    expect(res.error).toBeTruthy();
    expect(res.url).toBe("https://example.com/missing");
  });

  it("returns success:false (no throw) when fetch rejects", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const provider = new DirectFetchProvider();
    const res = await provider.crawl("https://example.com");

    expect(res.success).toBe(false);
    expect(res.markdown).toBe("");
    expect(res.error).toContain("network down");
  });

  it("crawlMany resolves all URLs in parallel", async () => {
    globalThis.fetch = mockFetch(SAMPLE_HTML);
    const provider = new DirectFetchProvider();
    const results = await provider.crawlMany([
      "https://a.com",
      "https://b.com",
    ]);

    expect(results.length).toBe(2);
    expect(results.map((r) => r.url)).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it("caps oversized response bodies", async () => {
    const huge = "<body>" + "a".repeat(5_000_000) + "</body>";
    globalThis.fetch = mockFetch(huge);
    const provider = new DirectFetchProvider();
    const res = await provider.crawl("https://big.com");
    expect(res.success).toBe(true);
    // markdown is bounded well below the raw 5MB body.
    expect(res.markdown.length).toBeLessThanOrEqual(2_000_000);
  });
});
