import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { socialCollector } from "../social";

const fx = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf8");
const cap = (raw: string) => ({ contentType: "text/html", raw, fetchedAt: new Date(0), status: 200 });

describe("socialCollector.parse", () => {
  it("extracts follower count", () => {
    const r = socialCollector.parse(cap(fx("social-profile.html")), { id: "s", type: "social", url: "https://x.com/acme", config: { platform: "x", handle: "acme" } });
    expect((r.structured as any).followers).toBe(12300);
    expect((r.structured as any).platform).toBe("x");
    expect(r.confidence).toBeGreaterThan(0.3);
  });

  it("returns low confidence when no follower count found", () => {
    const r = socialCollector.parse(cap("<html><body>nope</body></html>"), { id: "s", type: "social", url: "u" });
    expect(r.confidence).toBeLessThan(0.4);
  });
});
