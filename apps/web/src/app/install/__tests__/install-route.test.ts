import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "../route";

/** /install serves scripts/install.sh (raw from main) as text/x-shellscript. */

afterEach(() => vi.unstubAllGlobals());

describe("GET /install", () => {
  it("returns the install script as text/x-shellscript on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("#!/usr/bin/env sh\necho install\n", { status: 200 })),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/x-shellscript");
    expect(res.headers.get("cache-control")).toContain("max-age=300");
    expect(await res.text()).toContain("echo install");
  });

  it("returns 502 with a shell-comment body when the upstream fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.text()).toMatch(/^# could not fetch install\.sh/);
  });

  it("fetches the raw install.sh from the public repo main branch", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await GET();
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toBe(
      "https://raw.githubusercontent.com/hoaxnerd/burnless/main/scripts/install.sh",
    );
  });
});
