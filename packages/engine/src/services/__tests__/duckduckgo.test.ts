import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuckDuckGoProvider } from "../duckduckgo";
import type { WebSearchResponse } from "../web-search";

// A trimmed but structurally faithful sample of the DuckDuckGo HTML endpoint
// (https://html.duckduckgo.com/html/). Result anchors carry class `result__a`,
// snippets carry class `result__snippet`, and the href is a redirect wrapper
// whose real target lives in the `uddg` query param.
const SAMPLE_HTML = `
<!DOCTYPE html>
<html><body>
  <div class="results">
    <div class="result results_links results_links_deep web-result">
      <div class="result__body links_main links_deep">
        <h2 class="result__title">
          <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Falpha&amp;rut=abc">
            Alpha &amp; Beta Result
          </a>
        </h2>
        <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Falpha">
          First <b>snippet</b> describing alpha &amp; beta.
        </a>
      </div>
    </div>
    <div class="result results_links results_links_deep web-result">
      <div class="result__body links_main links_deep">
        <h2 class="result__title">
          <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.gamma.org%2Fpage%3Fx%3D1&amp;rut=def">
            Gamma Page
          </a>
        </h2>
        <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.gamma.org%2Fpage">
          Second snippet for gamma.
        </a>
      </div>
    </div>
  </div>
</body></html>
`;

function mockFetchHtml(html: string, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => html,
  } as unknown as Response);
}

describe("DuckDuckGoProvider", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses title/url/snippet from the DDG HTML endpoint", async () => {
    globalThis.fetch = mockFetchHtml(SAMPLE_HTML);

    const provider = new DuckDuckGoProvider();
    const res: WebSearchResponse = await provider.search("alpha");

    expect(res.query).toBe("alpha");
    expect(res.results.length).toBe(2);
    expect(res.totalResults).toBe(2);
    expect(typeof res.processingTimeMs).toBe("number");

    const [first, second] = res.results;
    // Title HTML entities decoded + tags stripped + whitespace collapsed.
    expect(first.title).toBe("Alpha & Beta Result");
    // Redirect-wrapped href resolved to the real target via the uddg param.
    expect(first.url).toBe("https://example.com/alpha");
    expect(first.snippet).toBe("First snippet describing alpha & beta.");

    expect(second.title).toBe("Gamma Page");
    expect(second.url).toBe("https://www.gamma.org/page?x=1");
    expect(second.snippet).toBe("Second snippet for gamma.");
  });

  it("respects maxResults", async () => {
    globalThis.fetch = mockFetchHtml(SAMPLE_HTML);
    const provider = new DuckDuckGoProvider();
    const res = await provider.search("alpha", { maxResults: 1 });
    expect(res.results.length).toBe(1);
  });

  it("filters by domain when domains option is given", async () => {
    globalThis.fetch = mockFetchHtml(SAMPLE_HTML);
    const provider = new DuckDuckGoProvider();
    const res = await provider.search("alpha", { domains: ["gamma.org"] });
    expect(res.results.length).toBe(1);
    expect(res.results[0].url).toContain("gamma.org");
  });

  it("returns an empty response (no throw) when fetch rejects", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const provider = new DuckDuckGoProvider();
    const res = await provider.search("anything");
    expect(res.results).toEqual([]);
    expect(res.totalResults).toBe(0);
    expect(res.query).toBe("anything");
  });

  it("returns an empty response (no throw) on a non-200 status", async () => {
    globalThis.fetch = mockFetchHtml("<html></html>", 503);
    const provider = new DuckDuckGoProvider();
    const res = await provider.search("anything");
    expect(res.results).toEqual([]);
    expect(res.totalResults).toBe(0);
  });

  it("returns an empty response when the HTML has no result rows", async () => {
    globalThis.fetch = mockFetchHtml("<html><body>no results</body></html>");
    const provider = new DuckDuckGoProvider();
    const res = await provider.search("anything");
    expect(res.results).toEqual([]);
  });
});
