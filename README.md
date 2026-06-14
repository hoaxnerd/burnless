<!-- TODO(#25): hero GIF of the AI companion driving a scenario -->

<div align="center">

# Burnless

### Open-source, AI-native FP&A for founders — self-host in one command.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
[![Latest release](https://img.shields.io/github/v/release/hoaxnerd/burnless?label=release)](https://github.com/hoaxnerd/burnless/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/hoaxnerd/burnless/ci.yml?label=CI)](https://github.com/hoaxnerd/burnless/actions)
[![GitHub stars](https://img.shields.io/github/stars/hoaxnerd/burnless?style=flat)](https://github.com/hoaxnerd/burnless/stargazers)
[![Discussions](https://img.shields.io/github/discussions/hoaxnerd/burnless)](https://github.com/hoaxnerd/burnless/discussions)

</div>

---

Burnless is an AI-native financial planning & analysis (FP&A) platform built for founders and startups. It reads your real financials and turns them into forecasts, scenarios, and board-ready reports — with an AI companion that can answer questions and take actions on your model directly. You can self-host it in a single command with an embedded database (no Docker, no Postgres to run), and a managed cloud edition — the same codebase with more turned on — is coming.

**What you get:**

- **AI companion** — a chat that reads your live financials and can take actions through tools (build a scenario, adjust headcount, edit a forecast line) instead of just talking about them.
- **Scenario planning** — model "what if" as a non-destructive override overlay on your real data; compare scenarios side by side, then promote the one you want to baseline.
- **Forecasting** — dependency-graph-driven forecast lines with multiple methods (fixed, growth rate, per-unit, percentage-of, custom formula), resolved in topological order.
- **Full financial model** — revenue (subscription/usage/one-time/services), expenses, funding rounds with cap-table and headcount modeling, all in one place.
- **Reports** — P&L, cash flow, balance sheet, runway, budget-vs-actuals, key metrics, and an AI-assisted board update.
- **Automations & MCP** — schedule recurring AI runs, connect external tools over MCP, and expose Burnless itself as an MCP server.
- **Bring any AI provider** — a provider-agnostic LLM layer works with Anthropic, OpenAI, OpenRouter, or fully local with Ollama. Embedded PGlite locally; Postgres for cloud and scale.

## Quickstart

Install with the shell one-liner:

```sh
curl -fsSL https://burnless.ai/install | sh
```

Or with npm:

```sh
npm install -g burnless
# or run without installing:
npx burnless start
```

Then start your instance:

```sh
burnless start
```

This opens Burnless on `http://127.0.0.1:2876` (port 2876 = **BURN**) with auto-login on the loopback interface, and drops you into the onboarding wizard.

**Requirements:** Node **≥ 20.9**. Don't have it (or the right version)? Pass `--with-node` to the installer and it will provision a pinned Node for you:

```sh
curl -fsSL https://burnless.ai/install | sh -s -- --with-node
```

> Prefer to read it first? `curl -fsSL https://burnless.ai/install | less`, then run it.

## Why Burnless

Your financial model is some of the most sensitive data your company has. Burnless is open-source so founders can own it outright — run it on your own machine, point it at any AI provider, and never hand your numbers to a black box. The AGPL license keeps improvements open: anyone who ships a modified Burnless shares those changes back.

The managed cloud edition (coming) runs the same codebase with the operational pieces handled for you, and funds continued development. The longer-term vision is to grow Burnless from finance outward into an all-in-one platform for the things founders have to do — but the core stays open.

## Self-host

The self-host story is the whole point: **a single artifact with an embedded database — no Docker, no Postgres to run.**

```sh
curl -fsSL https://burnless.ai/install | sh   # or: npm install -g burnless
burnless start
```

- **Requirements:** Node ≥ 20.9 (or pass `--with-node` to the installer to provision a pinned Node).
- **Your data** lives under `~/.burnless/data`. To back it up, copy that directory — it sits outside the versioned install, so it survives updates and rollbacks.
- **Updates** are atomic: `burnless update` swaps in the new version and runs a health check; if the new version fails to come up, it automatically rolls back to the prior one (your data is never touched).

By default Burnless binds to loopback (`127.0.0.1`) — that's what makes auto-login safe, since the loopback interface is the security boundary. Exposing it more widely is an explicit, opt-in step.

| | Self-host | Cloud *(coming)* |
|---|---|---|
| Who runs it | You | Managed for you |
| AI | Bring your own provider/key | Hosted AI with credits |
| Data | On your machine (`~/.burnless/data`) | Hosted |
| Ops | One command | Zero-ops |
| Cost | Free | Managed plans |

## How it works

Burnless is a pnpm + turbo monorepo. Data flows from the database through the financial engine and AI layer into a Next.js app:

```
                          ┌──────────────────────────┐
   apps/web  ────────────▶│  Next.js app + API +     │
   (dashboard, API,       │  the dashboard UI        │
    middleware)           └────────────┬─────────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                                ▼                                ▼
 packages/engine               packages/ai                       packages/db
 pure-TS financial calc        provider-agnostic LLM layer        Drizzle ORM
 (Decimal precision)           (Anthropic/OpenAI/                 PGlite local /
                                OpenRouter/Ollama)                 Postgres cloud

   packages/cli  →  the `burnless` CLI (start / update / mcp serve / …)
   packages/mcp  →  Model Context Protocol support (consume + expose)
   packages/types, packages/ui  →  shared TS types + React components
```

- **`apps/web`** — the Next.js app: dashboard, API routes, and middleware.
- **`packages/engine`** — pure-TypeScript financial calculations with Decimal.js precision (no I/O, no DB).
- **`packages/ai`** — the provider-agnostic LLM layer and chat/tool loop.
- **`packages/db`** — Drizzle ORM schema and queries; PGlite when self-hosted, Postgres for cloud/scale.
- **`packages/cli`** — the `burnless` CLI that installs, starts, updates, and manages your instance.
- **`packages/mcp`** — Model Context Protocol support: connect external MCP tools and expose Burnless as an MCP server.
- **`packages/types` / `packages/ui`** — shared TypeScript types and React components.

## Documentation

Start with [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and conventions. More documentation is on the way as the project matures.

## Community & support

- **Questions, ideas, show-and-tell:** [GitHub Discussions](https://github.com/hoaxnerd/burnless/discussions)
- **Bugs & feature requests:** [GitHub Issues](https://github.com/hoaxnerd/burnless/issues)

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) to get a local instance running and learn the conventions. On your first pull request, the CLA Assistant bot will ask you to sign a one-time Contributor License Agreement — it's a low-friction, automated step that takes a moment.

## Security

Found a vulnerability? Please report it privately — see [SECURITY.md](./SECURITY.md).

## License

Burnless is split so it's open where it matters and embeddable where it helps you:

- The server and the `@burnless/*` packages are **AGPL-3.0** ([LICENSE](./LICENSE)) — improvements stay open.
- The **`burnless` CLI is Apache-2.0** ([packages/cli/LICENSE](./packages/cli/LICENSE)) — so you can embed and script it freely.

A Contributor License Agreement exists for one reason: it lets us offer a commercial/hosted edition that funds development. It does not take away your rights to your own contribution — you keep them.

---

<sub>Burnless is an independent open-source project and is not affiliated with or endorsed by any third-party provider or trademark referenced above.</sub>
