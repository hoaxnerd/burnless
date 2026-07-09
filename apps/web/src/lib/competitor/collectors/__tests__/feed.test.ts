import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { feedCollector } from "../feed";

const load = (f: string) => readFileSync(join(__dirname, "fixtures", f), "utf8");
const raw = (body: string) => ({ contentType: "application/xml", raw: body, fetchedAt: new Date(), status: 200 });
const src = { id: "s1", type: "feed", url: "https://acme.com/rss" };

describe("feedCollector.parse", () => {
  it("parses RSS 2.0 into id-keyed items", () => {
    const r = feedCollector.parse(raw(load("rss.xml")), src);
    expect(r.confidence).toBe(0.9);
    expect(Object.keys(r.structured.items as object).sort()).toEqual(["g-1", "g-2"]);
    const i = (r.structured.items as Record<string, { title: string; publishedAt: string | null }>)["g-2"];
    expect(i.title).toBe("Second & Post");
    expect(i.publishedAt).toBe("2026-07-02T10:00:00.000Z");
  });

  it("parses Atom entries (href link + id + updated)", () => {
    const r = feedCollector.parse(raw(load("atom.xml")), src);
    expect(r.confidence).toBe(0.9);
    const items = r.structured.items as Record<string, { title: string; link: string }>;
    expect(items["tag:acme,2026:1"].title).toBe("Atom Post");
    expect(items["tag:acme,2026:1"].link).toBe("https://acme.com/a/1");
  });

  it("returns low confidence for a non-feed / empty document", () => {
    expect(feedCollector.parse(raw("<html><body>no feed</body></html>"), src).confidence).toBe(0.1);
    expect(feedCollector.parse(raw("<rss><channel></channel></rss>"), src).confidence).toBe(0.1);
  });
});
