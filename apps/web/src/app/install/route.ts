import { PUBLIC_REPO } from "@/lib/public-repo";

/**
 * GET /install — serves the repo's `scripts/install.sh` (raw from `main`) as
 * text/x-shellscript, so `curl -fsSL https://burnless.ai/install | sh` works
 * with ZERO env vars and the URL stays `burnless.ai/install` (fetch-and-return,
 * not a 302). This is the app-route replacement for the standalone Cloudflare
 * Worker — the cloud deployment owns it now.
 *
 * Tarballs are NOT served here — they download DIRECT from GitHub Releases
 * (too large to stream through the app); see scripts/install.sh.
 */
export const runtime = "nodejs";

const INSTALL_RAW = `https://raw.githubusercontent.com/${PUBLIC_REPO}/main/scripts/install.sh`;
// GitHub requires a User-Agent on every request.
const UA = "burnless.ai";

export async function GET(): Promise<Response> {
  const res = await fetch(INSTALL_RAW, {
    headers: { "user-agent": UA },
    // Cache the upstream fetch for 5 min (matches the prior Worker edge cache).
    next: { revalidate: 300 },
  });

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
