import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "../route";

/** /latest returns the latest PUBLISHED release version (no leading "v"). */

afterEach(() => vi.unstubAllGlobals());

describe("GET /latest", () => {
  it("returns the bare version (v-stripped) as text/plain on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ tag_name: "v0.1.1" }), { status: 200 })),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("cache-control")).toContain("max-age=300");
    expect(await res.text()).toBe("0.1.1\n");
  });

  it("returns 503 when there is no published release (GitHub 404)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.text()).toMatch(/no published release/);
  });

  it("returns 502 on other upstream errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("returns 502 when the tag cannot be parsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ tag_name: "" }), { status: 200 })),
    );
    const res = await GET();
    expect(res.status).toBe(502);
  });
});
