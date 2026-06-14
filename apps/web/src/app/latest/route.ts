import { PUBLIC_REPO } from "@/lib/public-repo";

/**
 * GET /latest — the latest PUBLISHED release version (e.g. "0.1.1", no leading
 * "v") as text/plain, read from the GitHub Releases API. `install.sh` reads this
 * (via https://burnless.ai/latest) to resolve the version to download when none
 * is pinned. App-route replacement for the standalone Cloudflare Worker.
 *
 * Only PUBLISHED releases are returned by /releases/latest — a draft release is
 * invisible here (a maintainer must publish it).
 */
export const runtime = "nodejs";

const RELEASES_API = `https://api.github.com/repos/${PUBLIC_REPO}/releases/latest`;
const UA = "burnless.ai";

export async function GET(): Promise<Response> {
  const res = await fetch(RELEASES_API, {
    headers: { "user-agent": UA, accept: "application/vnd.github+json" },
    next: { revalidate: 300 },
  });

  if (res.status === 404) {
    return new Response("no published release yet\n", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (!res.ok) {
    return new Response(`upstream error (${res.status})\n`, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const data = (await res.json()) as { tag_name?: unknown };
  const tag = typeof data.tag_name === "string" ? data.tag_name : "";
  const version = tag.replace(/^v/, "").trim();
  if (!version) {
    return new Response("could not parse latest version\n", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(version + "\n", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
