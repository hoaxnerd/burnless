# Contributing to burnless

Thanks for your interest in burnless — the open-source, self-hostable, AI-native FP&A platform for founders. Contributions of every size are welcome: bug fixes, docs, tests, new features, or just thoughtful issues. This guide explains how to get involved and what to expect.

## Ground rules

Be kind, be constructive. All participation in this project is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md) (Contributor Covenant 3.0). By taking part you agree to uphold it.

## Picking something to work on

- **Check the existing [issues](../../issues) first** — someone may already be on it, or there may be useful discussion.
- **Bugs, docs, and small fixes** can go straight to a pull request.
- **Larger features should open an issue first** to discuss the approach and get a thumbs-up before you build. This avoids wasted work on something that might not fit the roadmap or design.
- New here? Look for issues tagged [`good first issue`](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) — these are scoped to be approachable.

## Development setup

### Prerequisites

- **Node.js ≥ 20.9** (`node --version`)
- **pnpm** — enable via Corepack: `corepack enable` (the repo pins `pnpm@10.26.1` via `packageManager`)
- **Git**

### Get it running

```bash
# 1. Install all workspace dependencies (from the repo root)
pnpm install

# 2. Configure your environment — pick ONE:
#    (a) Postgres dev DB via Docker:
cp .env.docker .env
#    (b) …or just run with the bundled embedded PGlite datastore —
#        no separate database needed; `pnpm dev` works out of the box.

# 3. Start the dev servers (web on http://localhost:3000)
pnpm dev
```

This is a **pnpm + turbo monorepo**. To work inside a single package, use the filter syntax:

```bash
pnpm --filter @burnless/<pkg> <script>
# e.g.
pnpm --filter @burnless/engine test
pnpm --filter @burnless/web dev
```

Packages: `apps/web` (Next.js), `packages/{db,engine,ai,types,ui,cli,mcp}`.

## The check gate (run before pushing)

Before you push, your change must pass:

```bash
pnpm check   # type-check + lint across the workspace
pnpm test    # vitest unit/integration tests
```

Notes:

- Tests run on **vitest**. DB tests use **in-memory PGlite** (real Postgres semantics, no external database).
- `pnpm test` runs the whole suite via turbo. When iterating, prefer per-package runs to keep feedback fast and avoid running everything at once:
  ```bash
  pnpm --filter @burnless/db test
  pnpm --filter @burnless/web test
  ```
- End-to-end specs run on **Playwright** (`pnpm e2e`) — run these when your change touches a full user flow.

## Both editions

burnless runs as both **self-host** (`self_host`) and **cloud** (`cloud`) from a single codebase, gated by capability flags. If your change behaves differently depending on the edition, **test both** — they are driven by `BURNLESS_DEPLOYMENT` and the `BURNLESS_CAP_*` capability flags. Don't assume one edition's behavior covers the other.

## Commit & PR conventions

- **[Conventional Commits](https://www.conventionalcommits.org/)** — e.g. `feat(scope): …`, `fix: …`, `chore: …`, `docs: …`.
- **Keep PRs focused and reasonably small** — single responsibility per PR. As a rough guide, aim for under ~500 lines / 10 files changed, excluding generated files and docs. Large, mixed PRs are hard to review and slow to land.
- **Reference issues** with GitHub keywords so they auto-close on merge: `Closes #123`, `Fixes #123`.
- **Enable "Allow edits from maintainers"** on your PR so we can help nudge it over the line.
- **Migrations are NEVER hand-authored.** Always generate them with drizzle-kit via `pnpm db:generate` — never write or edit the SQL in `packages/db/drizzle/` by hand.

## Contributor License Agreement (CLA)

By contributing you agree to our Contributor License Agreement. When you open your first pull request, the [CLA Assistant](https://cla-assistant.io/) bot will comment and ask you to sign — it takes a few seconds, one time. The CLA does not take away your rights to your own contribution; it lets the project also offer a commercial/hosted edition that funds development.

## License of contributions

burnless is dual-licensed:

- The **server / application code is AGPL-3.0**.
- The **`burnless` CLI is Apache-2.0**.

Your contribution is licensed under the license of the package you're editing. If you're unsure which applies to your change, ask in the issue or PR.
