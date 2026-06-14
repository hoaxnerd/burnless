# burnless.ai edge Worker

A tiny Cloudflare Worker that fronts burnless's GitHub-native distribution. It owns two routes
on `burnless.ai`:

| Route | Behavior | Content-Type |
|---|---|---|
| `GET /install` | Fetches `scripts/install.sh` from the repo's `main` branch (raw GitHub) and returns it verbatim, so the URL stays `burnless.ai/install`. | `text/x-shellscript` |
| `GET /latest` | Reads the latest published GitHub Release (`/releases/latest`), strips the leading `v` from `tag_name`, returns the bare version (e.g. `0.1.0`). 404 (no release yet) → `503` with a clear message. | `text/plain` |

Everything else → `404`.

## Why a Worker (and what it deliberately does NOT do)

`curl -fsSL https://burnless.ai/install | sh` must work with **zero env vars**. The installer
needs to (1) discover the latest version and (2) download the release tarball. The Worker serves
(1) `/install` (the script) and `/latest` (the version string). It does **NOT** proxy the
tarball — that downloads **direct from GitHub Releases**
(`https://github.com/<org>/burnless/releases/download/v<ver>/burnless-<ver>.tar.gz` + `.sha256`),
because the fat-artifact is far too large to stream through a Worker.

The installer verifies the tarball's sha256 **before** unpacking, so direct-from-GitHub download
is safe.

## Deploy

This Worker is **committed here but deployed by a maintainer** once the public repo + `burnless.ai`
DNS are live.

```sh
cd cloudflare
# one-time: npm i -g wrangler  (and `wrangler login`)
wrangler deploy worker.js --name burnless-edge
```

Then map the routes to the Worker in the Cloudflare dashboard (or `wrangler.toml`):

- `burnless.ai/install`
- `burnless.ai/latest`

Before deploying, set the `ORG`/`REPO` constants at the top of `worker.js` to the final public
GitHub org/repo (see the `TODO` comment). The default is `burnless/burnless`.

## Not in scope here

The **landing page** for `burnless.ai` is hosted separately on **Cloudflare Pages** (task #25) —
this Worker only owns the `/install` and `/latest` paths.
