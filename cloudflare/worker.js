/**
 * burnless.ai edge Worker (S6 W4) — fronts the GitHub-native distribution.
 *
 * Routes:
 *   GET /install  → serves the repo's install.sh (raw from main) as text/x-shellscript,
 *                   so `curl -fsSL https://burnless.ai/install | sh` works with ZERO env vars
 *                   and the URL stays burnless.ai/install (fetch-and-return, not a 302).
 *   GET /latest   → the latest published release version (e.g. "0.1.0", no leading "v"),
 *                   read from the GitHub Releases API. text/plain.
 *   else          → 404.
 *
 * Tarballs are NOT proxied here — they download DIRECT from GitHub Releases
 * (https://github.com/<org>/burnless/releases/download/v<ver>/burnless-<ver>.tar.gz),
 * because they are too large to stream through the Worker.
 *
 * Deployed by the founder in Phase B (see README.md). The landing page is hosted separately
 * on Cloudflare Pages (task #25) — this Worker only owns the /install + /latest routes.
 */

// TODO(S6 Phase B): set ORG to the final public GitHub org when the public repo is created.
const ORG = "burnless";
const REPO = "burnless";
const INSTALL_RAW = `https://raw.githubusercontent.com/${ORG}/${REPO}/main/scripts/install.sh`;
const RELEASES_API = `https://api.github.com/repos/${ORG}/${REPO}/releases/latest`;
// GitHub's API requires a User-Agent header on every request.
const UA = "burnless.ai-worker";

export default {
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/install") {
      const res = await fetch(INSTALL_RAW, { headers: { "user-agent": UA } });
      if (!res.ok) {
        return new Response(`# could not fetch install.sh (upstream ${res.status})\n`, {
          status: 502,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
      const body = await res.text();
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/x-shellscript; charset=utf-8",
          "cache-control": "public, max-age=300",
        },
      });
    }

    if (req.method === "GET" && url.pathname === "/latest") {
      const res = await fetch(RELEASES_API, {
        headers: { "user-agent": UA, accept: "application/vnd.github+json" },
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
      const data = await res.json();
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

    return new Response("not found\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
